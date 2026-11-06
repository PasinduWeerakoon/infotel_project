/**
 * Participants (counted from the scans QuickLook sends), session totals, the leaderboard and winners.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { countReachedAt, leaderboardKey } from '../domain/rules.js';
import type { Participant, SessionStats, Winner } from '../domain/types.js';
import { db, isConditionFailure } from './db.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;

export async function getParticipant(sessionId: string, userId: string): Promise<Participant | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: T(), Key: keys.participant(sessionId, userId), ConsistentRead: true }),
  );
  return clean<Participant>(result.Item);
}

/** Next player number of the session (#1, #2, ...). Numbers are never reused. */
export async function nextPlayerNumber(sessionId: string): Promise<number> {
  const result = await db.send(
    new UpdateCommand({
      TableName: T(),
      Key: keys.counter(sessionId),
      UpdateExpression: 'ADD #next :one',
      ExpressionAttributeNames: { '#next': 'next' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(result.Attributes?.next ?? 1);
}

export async function playerCount(sessionId: string): Promise<number> {
  const result = await db.send(new GetCommand({ TableName: T(), Key: keys.counter(sessionId) }));
  return Number(result.Item?.next ?? 0);
}

/** True when this put created the item (false: it was already there) */
async function putIfNew(item: Record<string, unknown>): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({ TableName: T(), Item: item, ConditionExpression: 'attribute_not_exists(PK)' }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

const ignoreConditionFailure = (error: unknown) => {
  if (!isConditionFailure(error)) throw error;
};

interface LogoScan {
  sessionId: string;
  pointsPerStall: number;
  userId: string;
  userName: string;
  logoId: string;
  /** Scan time, ISO */
  at: string;
}

/**
 * Adds a logo to an existing participant, exactly once: the update only lands when the logo is
 * not in the participant's counted logo IDs yet. Returns the updated participant, or why not.
 */
async function addLogo(
  scan: LogoScan,
): Promise<{ added: Participant } | { missing: true } | { repeat: true } | { retry: true }> {
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.participant(scan.sessionId, scan.userId),
        UpdateExpression:
          'SET fullName = :name, logos = list_append(logos, :logo) ADD stalls :one, points :points, totalScans :one, logoIds :ids',
        ConditionExpression: 'attribute_exists(PK) AND NOT contains(logoIds, :id)',
        ExpressionAttributeValues: {
          ':name': scan.userName,
          ':logo': [{ logoId: scan.logoId, firstScannedAt: scan.at }],
          ':one': 1,
          ':points': scan.pointsPerStall,
          ':ids': new Set([scan.logoId]),
          ':id': scan.logoId,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { added: clean<Participant>(result.Attributes) as Participant };
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
  }
  // The condition failed: the participant did not exist, or the logo had already counted. Look
  // again: a parallel scan may have created the participant since, so only a logo really in the
  // counted set is a repeat. Anything else is tried again.
  const result = await db.send(
    new GetCommand({
      TableName: T(),
      Key: keys.participant(scan.sessionId, scan.userId),
      ProjectionExpression: 'logoIds, PK',
      ConsistentRead: true,
    }),
  );
  if (!result.Item) return { missing: true };
  const counted = result.Item.logoIds as Set<string> | undefined;
  return counted?.has(scan.logoId) ? { repeat: true } : { retry: true };
}

/** Creates the participant once. Only the put that creates it takes a player number (no gaps). */
async function createParticipant(scan: LogoScan): Promise<void> {
  const created = await putIfNew({
    ...keys.participant(scan.sessionId, scan.userId),
    sessionId: scan.sessionId,
    userId: scan.userId,
    playerNumber: 0,
    fullName: scan.userName,
    stalls: 0,
    points: 0,
    totalScans: 0,
    reachedAt: scan.at,
    logos: [],
    disqualified: false,
    winnerRank: null,
  });
  if (created) await assignPlayerNumber(scan.sessionId, scan.userId);
}

/** Gives the participant just created (#0) the next player number. Only the creating put calls it */
async function assignPlayerNumber(sessionId: string, userId: string): Promise<void> {
  await db
    .send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.participant(sessionId, userId),
        UpdateExpression: 'SET playerNumber = :n',
        ConditionExpression: 'playerNumber = :zero',
        ExpressionAttributeValues: { ':n': await nextPlayerNumber(sessionId), ':zero': 0 },
      }),
    )
    .catch(ignoreConditionFailure);
}

/** The reach time and leaderboard key follow the count. Only the write for the latest count lands. */
async function syncLeaderboardKey(p: Participant): Promise<void> {
  const reachedAt = countReachedAt(p);
  await db
    .send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.participant(p.sessionId, p.userId),
        UpdateExpression: 'SET reachedAt = :at, GSI1PK = :pk, GSI1SK = :sk',
        ConditionExpression: 'stalls = :stalls',
        ExpressionAttributeValues: {
          ':at': reachedAt,
          ':pk': `LB#${p.sessionId}`,
          ':sk': leaderboardKey(p.stalls, reachedAt, p.userId),
          ':stalls': p.stalls,
        },
      }),
    )
    .catch(ignoreConditionFailure);
}

/**
 * Counts one scan of an event logo: the first scan of a logo by a visitor in a session adds a
 * stall, exactly once, even when scans arrive in parallel or a failed scan is sent again.
 * A repeat adds to the scan total and repairs the leaderboard key if an earlier failed scan left
 * it behind, so a retry always ends in the right state.
 */
export async function recordLogoScan(scan: LogoScan): Promise<'counted' | 'repeat'> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const outcome = await addLogo(scan);
    if ('added' in outcome) {
      await syncLeaderboardKey(outcome.added);
      return 'counted';
    }
    if ('repeat' in outcome) {
      const result = await db.send(
        new UpdateCommand({
          TableName: T(),
          Key: keys.participant(scan.sessionId, scan.userId),
          UpdateExpression: 'SET fullName = :name ADD totalScans :one',
          ExpressionAttributeValues: { ':name': scan.userName, ':one': 1 },
          ReturnValues: 'ALL_NEW',
        }),
      );
      const participant = clean<Participant>(result.Attributes) as Participant;
      await syncLeaderboardKey(participant);
      return 'repeat';
    }
    if ('missing' in outcome) await createParticipant(scan); // then add the logo on the next attempt
  }
  throw new Error('Could not count the scan, it is sent again by QuickLook');
}

export async function getStats(sessionId: string): Promise<SessionStats> {
  const result = await db.send(new GetCommand({ TableName: T(), Key: keys.stats(sessionId) }));
  return { sessionId, lastScanAt: null, scans: 0, ...clean<SessionStats>(result.Item) };
}

/** One more scan received for the session */
export async function bumpStats(sessionId: string, at: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: T(),
      Key: keys.stats(sessionId),
      UpdateExpression: 'SET sessionId = :id, lastScanAt = :at ADD scans :one',
      ExpressionAttributeValues: { ':id': sessionId, ':at': at, ':one': 1 },
    }),
  );
}

/** Top players in rank order (disqualified players are filtered out by the caller). */
export async function topParticipants(sessionId: string, limit: number): Promise<Participant[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: T(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `LB#${sessionId}` },
      Limit: limit,
    }),
  );
  return (result.Items ?? []).map((item) => clean<Participant>(item) as Participant);
}

/** Everyone on the leaderboard in rank order, disqualified players left out (for the paged list). */
export async function rankedParticipants(sessionId: string): Promise<Participant[]> {
  const items: Participant[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'disqualified <> :true',
        ExpressionAttributeValues: { ':pk': `LB#${sessionId}`, ':true': true },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []).map((item) => clean<Participant>(item) as Participant));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/** Rank = players ahead on the leaderboard index + 1 (disqualified players are not counted). */
export async function rankOf(participant: Participant): Promise<number> {
  let ahead = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK < :mine',
        FilterExpression: 'disqualified <> :true',
        ExpressionAttributeValues: {
          ':pk': `LB#${participant.sessionId}`,
          ':mine': leaderboardKey(participant.stalls, participant.reachedAt, participant.userId),
          ':true': true,
        },
        Select: 'COUNT',
        ExclusiveStartKey: startKey,
      }),
    );
    ahead += page.Count ?? 0;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return ahead + 1;
}

async function queryPrefix<R>(sessionId: string, prefix: string): Promise<R[]> {
  const items: R[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}`, ':sk': prefix },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []).map((item) => clean<R>(item) as R));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export const listParticipants = (sessionId: string) => queryPrefix<Participant>(sessionId, 'PART#');

export const listWinners = (sessionId: string) => queryPrefix<Winner>(sessionId, 'WINNER#');

export async function saveWinners(sessionId: string, winners: Winner[], previous: Winner[]): Promise<void> {
  // Ranks that no longer have a winner are cleared
  for (const old of previous) {
    if (!winners.some((w) => w.rank === old.rank)) {
      await db.send(new DeleteCommand({ TableName: T(), Key: keys.winner(sessionId, old.rank) }));
    }
  }
  for (const winner of winners) {
    await db.send(
      new PutCommand({ TableName: T(), Item: { ...keys.winner(sessionId, winner.rank), ...winner } }),
    );
  }
  // The winner flag on the participants, for later processes
  const ranks = new Map<string, number | null>(winners.map((w) => [w.userId, w.rank]));
  for (const old of previous) if (!ranks.has(old.userId)) ranks.set(old.userId, null);
  for (const [userId, rank] of ranks) {
    await db
      .send(
        new UpdateCommand({
          TableName: T(),
          Key: keys.participant(sessionId, userId),
          UpdateExpression: 'SET winnerRank = :rank',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':rank': rank },
        }),
      )
      .catch(ignoreConditionFailure);
  }
}

export async function setDisqualified(
  sessionId: string,
  userId: string,
  disqualified: boolean,
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: T(),
      Key: keys.participant(sessionId, userId),
      UpdateExpression: 'SET disqualified = :d',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':d': disqualified },
    }),
  );
}

export async function rememberDayWinner(date: string, userId: string, sessionId: string): Promise<void> {
  await db.send(new PutCommand({ TableName: T(), Item: { ...keys.dayWinner(date, userId), sessionId } }));
}

export async function dayWinners(date: string): Promise<Map<string, string>> {
  const result = await db.send(
    new QueryCommand({
      TableName: T(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `WINNERDAY#${date}` },
    }),
  );
  return new Map(
    (result.Items ?? []).map((item) => [String(item.SK).replace('USER#', ''), String(item.sessionId)]),
  );
}

/** Marks a winner's prize collected once. */
export async function collectWinner(
  sessionId: string,
  rank: number,
  by: string,
  at: string,
): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.winner(sessionId, rank),
        UpdateExpression: 'SET collectedAt = :at, collectedBy = :by',
        ConditionExpression: '#status = :confirmed AND collectedAt = :null',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':at': at, ':by': by, ':confirmed': 'confirmed', ':null': null },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}
