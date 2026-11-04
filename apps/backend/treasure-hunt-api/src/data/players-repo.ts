/**
 * Participants (counted from the scans QuickLook sends), session totals, the leaderboard and winners.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { leaderboardKey } from '../domain/rules.js';
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

/** Adds one different logo to an existing participant, or returns null when there is none yet */
async function addStall(scan: LogoScan): Promise<Participant | null> {
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.participant(scan.sessionId, scan.userId),
        UpdateExpression:
          'SET fullName = :name, reachedAt = :at, logos = list_append(logos, :logo) ADD stalls :one, points :points, totalScans :one',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {
          ':name': scan.userName,
          ':at': scan.at,
          ':logo': [{ logoId: scan.logoId, firstScannedAt: scan.at }],
          ':one': 1,
          ':points': scan.pointsPerStall,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return clean<Participant>(result.Attributes) ?? null;
  } catch (error) {
    if (isConditionFailure(error)) return null;
    throw error;
  }
}

/**
 * Counts one scan of an event logo. The first scan of a logo by a visitor in a session adds a
 * stall (a conditional write, so repeats and scans sent in parallel never count twice). Returns
 * whether it counted.
 */
export async function recordLogoScan(scan: LogoScan): Promise<'counted' | 'repeat'> {
  const first = await putIfNew({ ...keys.visit(scan.sessionId, scan.userId, scan.logoId), at: scan.at });
  if (!first) {
    // A repeat arriving together with the first scan may find the participant not created yet
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.send(
          new UpdateCommand({
            TableName: T(),
            Key: keys.participant(scan.sessionId, scan.userId),
            UpdateExpression: 'SET fullName = :name ADD totalScans :one',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':name': scan.userName, ':one': 1 },
          }),
        );
        break;
      } catch (error) {
        ignoreConditionFailure(error);
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }
    return 'repeat';
  }

  let participant = await addStall(scan);
  if (!participant) {
    // A new visitor in this session. If another scan of theirs creates them at the same moment,
    // only one put lands, and only that one takes a player number (so numbers have no gaps).
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
    if (created) {
      await db.send(
        new UpdateCommand({
          TableName: T(),
          Key: keys.participant(scan.sessionId, scan.userId),
          UpdateExpression: 'SET playerNumber = :n',
          ExpressionAttributeValues: { ':n': await nextPlayerNumber(scan.sessionId) },
        }),
      );
    }
    participant = await addStall(scan);
  }
  if (participant) {
    // The leaderboard key follows the count. Only the write for the latest count lands.
    await db
      .send(
        new UpdateCommand({
          TableName: T(),
          Key: keys.participant(scan.sessionId, scan.userId),
          UpdateExpression: 'SET GSI1PK = :pk, GSI1SK = :sk',
          ConditionExpression: 'stalls = :stalls',
          ExpressionAttributeValues: {
            ':pk': `LB#${scan.sessionId}`,
            ':sk': leaderboardKey(participant.stalls, participant.reachedAt),
            ':stalls': participant.stalls,
          },
        }),
      )
      .catch(ignoreConditionFailure);
  }
  return 'counted';
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
          ':mine': leaderboardKey(participant.stalls, participant.reachedAt),
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
