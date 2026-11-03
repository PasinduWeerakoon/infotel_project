/**
 * Sessions and their prize allocations.
 */
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { env } from '../config.js';
import type { Allocation, Game, Session } from '../domain/types.js';
import { addSeconds, colomboDate, nowIso } from '../lib/time.js';
import { db, isConditionFailure, retryOnConflict } from './db.js';
import { clean, keys } from './keys.js';

export async function listSessionsByDate(date: string): Promise<Session[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': `DATE#${date}` },
    }),
  );
  return (result.Items ?? []).map((item) => clean<Session>(item) as Session);
}

// Today's and tomorrow's sessions are read on every visitor request, so they are cached briefly.
// Staff changes (open, close, edit) take effect within 5 seconds.
let todayCache: { key: string; sessions: Session[]; at: number } | undefined;

/** Sessions of today and tomorrow (tomorrow is needed for "next session" messages). */
export async function upcomingSessions(): Promise<Session[]> {
  const today = colomboDate();
  const tomorrow = colomboDate(new Date(Date.now() + 86_400_000));
  const key = `${today}|${tomorrow}`;
  if (todayCache && todayCache.key === key && Date.now() - todayCache.at < 5000) return todayCache.sessions;
  const [a, b] = await Promise.all([listSessionsByDate(today), listSessionsByDate(tomorrow)]);
  const sessions = [...a, ...b].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  todayCache = { key, sessions, at: Date.now() };
  return sessions;
}

export const clearSessionCache = () => {
  todayCache = undefined;
};

/** Every session of the event (admin views). */
export async function listAllSessions(): Promise<Session[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'SESSIONS' },
    }),
  );
  return (result.Items ?? []).map((item) => clean<Session>(item) as Session);
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.session(sessionId) }));
  return clean<Session>(result.Item);
}

export async function saveSession(session: Session): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: env.TABLE_NAME,
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
  clearSessionCache();
}

export async function setSessionOverride(sessionId: string, override: Session['override']): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: env.TABLE_NAME,
      Key: keys.session(sessionId),
      UpdateExpression:
        override === 'open' ? 'SET #override = :override, openedAt = :now' : 'SET #override = :override',
      ExpressionAttributeNames: { '#override': 'override' },
      ExpressionAttributeValues: {
        ':override': override,
        ...(override === 'open' ? { ':now': nowIso() } : {}),
      },
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
  clearSessionCache();
}

/** Deletes a session and its allocations. Callers check first that nobody has played. */
export async function deleteSession(sessionId: string): Promise<void> {
  const allocations = await listAllocations(sessionId);
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.session(sessionId) }));
  await batchWrite(
    allocations.map((a) => ({ DeleteRequest: { Key: keys.allocation(a.sessionId, a.game, a.prizeId) } })),
  );
  clearSessionCache();
}

export async function listAllocations(sessionId: string, game?: Game): Promise<Allocation[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}`, ':sk': game ? `ALLOC#${game}#` : 'ALLOC#' },
      ConsistentRead: true,
    }),
  );
  return (result.Items ?? []).map((item) => clean<Allocation>(item) as Allocation);
}

/**
 * Sets allocated quantities. `remaining` is derived as allocated minus given, so changes during
 * a live session keep the counts right. The condition protects against a play landing in between.
 */
export async function setAllocated(row: {
  sessionId: string;
  game: Game;
  prizeId: string;
  allocated: number;
  given: number;
}) {
  // A play may be writing this allocation at the same moment: retry briefly instead of failing
  await retryOnConflict(() =>
    db.send(
      new UpdateCommand({
        TableName: env.TABLE_NAME,
        Key: keys.allocation(row.sessionId, row.game, row.prizeId),
        UpdateExpression:
          'SET sessionId = :s, game = :g, prizeId = :p, allocated = :a, remaining = :r, given = if_not_exists(given, :zero), GSI1PK = :g1pk, GSI1SK = :g1sk',
        ConditionExpression: 'attribute_not_exists(given) OR given = :given',
        ExpressionAttributeValues: {
          ':s': row.sessionId,
          ':g': row.game,
          ':p': row.prizeId,
          ':a': row.allocated,
          ':r': row.allocated - row.given,
          ':zero': 0,
          ':given': row.given,
          ':g1pk': 'ALLOC',
          ':g1sk': `${row.prizeId}#${row.sessionId}#${row.game}`,
        },
      }),
    ),
  );
}

/** Every allocation of the event, used for stock checks and prize totals (admin only). */
export async function listAllAllocations(): Promise<Allocation[]> {
  const items: Allocation[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: env.TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ALLOC' },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []).map((item) => clean<Allocation>(item) as Allocation));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/**
 * Runs one allocation save at a time. Each save then checks stock against the latest saved
 * quantities, so two admins saving together can never go over stock: the later save wins when it
 * still fits, otherwise it is refused. Returns null when another save holds the lock for too long.
 */
export async function withAllocationLock<T>(work: () => Promise<T>): Promise<{ result: T } | null> {
  const owner = ulid();
  for (let attempt = 0; attempt < 20; attempt++) {
    const now = nowIso();
    try {
      await db.send(
        new PutCommand({
          TableName: env.TABLE_NAME,
          Item: { ...keys.allocationLock(), owner, expiresAt: addSeconds(now, 20) },
          ConditionExpression: 'attribute_not_exists(PK) OR expiresAt < :now',
          ExpressionAttributeValues: { ':now': now },
        }),
      );
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    try {
      return { result: await work() };
    } finally {
      await db
        .send(
          new DeleteCommand({
            TableName: env.TABLE_NAME,
            Key: keys.allocationLock(),
            ConditionExpression: '#owner = :owner',
            ExpressionAttributeNames: { '#owner': 'owner' },
            ExpressionAttributeValues: { ':owner': owner },
          }),
        )
        .catch((error) => {
          if (!isConditionFailure(error)) throw error;
        });
    }
  }
  return null;
}

export async function markRolledOver(sessionId: string): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: env.TABLE_NAME,
        Key: keys.session(sessionId),
        UpdateExpression: 'SET rolledOver = :true',
        ConditionExpression: 'rolledOver = :false',
        ExpressionAttributeValues: { ':true': true, ':false': false },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

async function batchWrite(requests: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < requests.length; i += 25) {
    await db.send(new BatchWriteCommand({ RequestItems: { [env.TABLE_NAME]: requests.slice(i, i + 25) } }));
  }
}
