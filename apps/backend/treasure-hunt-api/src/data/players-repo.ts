/**
 * Participants (standings read from QuickLook), sync status, the leaderboard and winners.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { leaderboardKey } from '../domain/rules.js';
import type { Participant, SyncStatus, Winner } from '../domain/types.js';
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

/** Saves a participant with its leaderboard key (QuickLook's rank). */
export async function saveParticipant(participant: Participant): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: T(),
      Item: {
        ...keys.participant(participant.sessionId, participant.userId),
        GSI1PK: `LB#${participant.sessionId}`,
        GSI1SK: leaderboardKey(participant.rank),
        ...participant,
      },
    }),
  );
}

export async function getSyncStatus(sessionId: string): Promise<SyncStatus | undefined> {
  const result = await db.send(new GetCommand({ TableName: T(), Key: keys.sync(sessionId) }));
  return clean<SyncStatus>(result.Item);
}

export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  await db.send(new PutCommand({ TableName: T(), Item: { ...keys.sync(status.sessionId), ...status } }));
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
          ':mine': leaderboardKey(participant.rank),
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
