/**
 * Treasure Hunt sessions (with the QuickLook logos selected for each).
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { HuntSession } from '../domain/types.js';
import { colomboDate } from '../lib/time.js';
import { db, isConditionFailure } from './db.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;

async function queryAll<R>(input: ConstructorParameters<typeof QueryCommand>[0]): Promise<R[]> {
  const items: R[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
    items.push(...(page.Items ?? []).map((item) => clean<R>(item) as R));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export const listSessionsByDate = (date: string) =>
  queryAll<HuntSession>({
    TableName: T(),
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: { ':pk': `DATE#${date}` },
  });

export const listAllSessions = () =>
  queryAll<HuntSession>({
    TableName: T(),
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'SESSIONS' },
  });

// Read on every visitor request, so cached for 5 seconds per Lambda instance
let cache: { key: string; sessions: HuntSession[]; at: number } | undefined;

/** Sessions of yesterday, today and tomorrow (enough for scoring, "next session" and late results). */
export async function nearbySessions(): Promise<HuntSession[]> {
  const days = [-1, 0, 1].map((offset) => colomboDate(new Date(Date.now() + offset * 86_400_000)));
  const key = days.join('|');
  if (cache && cache.key === key && Date.now() - cache.at < 5000) return cache.sessions;
  const sessions = (await Promise.all(days.map(listSessionsByDate))).flat();
  cache = { key, sessions, at: Date.now() };
  return sessions;
}

export async function getSession(sessionId: string): Promise<HuntSession | undefined> {
  const result = await db.send(new GetCommand({ TableName: T(), Key: keys.session(sessionId) }));
  return clean<HuntSession>(result.Item);
}

export async function saveSession(session: HuntSession): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: T(),
      Item: {
        ...keys.session(session.sessionId),
        GSI1PK: 'SESSIONS',
        GSI1SK: session.startsAt,
        GSI2PK: `DATE#${session.date}`,
        GSI2SK: session.startsAt,
        ...session,
      },
    }),
  );
  cache = undefined;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: T(), Key: keys.session(sessionId) }));
  cache = undefined;
}

/** Marks a session finalized once. Returns false if another run already did it. */
export async function markFinalized(sessionId: string): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.session(sessionId),
        UpdateExpression: 'SET finalized = :true',
        ConditionExpression: 'finalized = :false',
        ExpressionAttributeValues: { ':true': true, ':false': false },
      }),
    );
    cache = undefined;
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}
