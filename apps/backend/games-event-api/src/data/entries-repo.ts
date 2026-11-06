/**
 * Entries (one per scan), plays, references and the transactions that protect the rules:
 * one play per visitor per session, one player per stall screen, no over-allocation.
 */
import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { Entry, Game, PlayerDetails, Voided } from '../domain/types.js';
import type { TransactItem } from './claims-repo.js';
import { cancellationReasons, db, isConditionFailure, isTransactionConflict, retryOnConflict } from './db.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;

export async function getEntry(entryId: string): Promise<Entry | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: T(), Key: keys.entry(entryId), ConsistentRead: true }),
  );
  return clean<Entry>(result.Item);
}

/** The entry this visitor already has in the session, if any. */
export async function getPlayerGuard(
  sessionId: string,
  userId: string,
): Promise<{ entryId: string } | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: T(), Key: keys.player(sessionId, userId), ConsistentRead: true }),
  );
  return result.Item ? { entryId: String(result.Item.entryId) } : undefined;
}

export type CreateEntryFailure = 'ALREADY_PLAYED' | 'SCREEN_BUSY' | 'SCAN_USED';

/**
 * Creates an entry in one transaction:
 * 1. the entry itself
 * 2. the player guard (one play per session, across both games); an expired unplayed entry can be replaced
 * 3. the stall screen lock (free or expired)
 * 4. the scan in the platform table is marked as used (a scan creates at most one entry)
 */
export async function createEntry(
  entry: Entry,
  replaceExpiredEntryId?: string,
): Promise<CreateEntryFailure | null> {
  try {
    return await retryOnConflict(() => tryCreateEntry(entry, replaceExpiredEntryId));
  } catch (error) {
    // Still colliding after the retries: other visitors are taking this screen right now
    if (isTransactionConflict(error)) return 'SCREEN_BUSY';
    throw error;
  }
}

async function tryCreateEntry(
  entry: Entry,
  replaceExpiredEntryId?: string,
): Promise<CreateEntryFailure | null> {
  // Cheap read first: when someone holds the screen, answer at once without a transaction, so
  // the crowd does not pile transactions onto the lock item. The transaction below still decides.
  const held = await db.send(new GetCommand({ TableName: T(), Key: keys.lock(entry.lockKey) }));
  if (held.Item && String(held.Item.expiresAt) >= entry.createdAt) return 'SCREEN_BUSY';

  const transactItems: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
    {
      Put: {
        TableName: T(),
        Item: { ...keys.entry(entry.entryId), ...entry },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: T(),
        Item: {
          ...keys.player(entry.sessionId, entry.userId),
          entryId: entry.entryId,
          game: entry.game,
          createdAt: entry.createdAt,
        },
        ConditionExpression: replaceExpiredEntryId ? 'entryId = :previous' : 'attribute_not_exists(PK)',
        ...(replaceExpiredEntryId
          ? { ExpressionAttributeValues: { ':previous': replaceExpiredEntryId } }
          : {}),
      },
    },
    {
      Put: {
        TableName: T(),
        Item: {
          ...keys.lock(entry.lockKey),
          lockKey: entry.lockKey,
          entryId: entry.entryId,
          game: entry.game,
          expiresAt: entry.expiresAt,
        },
        ConditionExpression: 'attribute_not_exists(PK) OR expiresAt < :now',
        ExpressionAttributeValues: { ':now': entry.createdAt },
      },
    },
    {
      Update: {
        TableName: env.PLATFORM_TABLE_NAME,
        Key: keys.platformScan(entry.scanId),
        UpdateExpression: 'SET usedBy = :entryId',
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(usedBy)',
        ExpressionAttributeValues: { ':entryId': entry.entryId },
      },
    },
  ];
  if (replaceExpiredEntryId) {
    transactItems.push({
      Update: {
        TableName: T(),
        Key: keys.entry(replaceExpiredEntryId),
        UpdateExpression: 'SET #status = :expired',
        ConditionExpression: '#status <> :played',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':expired': 'expired', ':played': 'played' },
      },
    });
  }

  try {
    await db.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return null;
  } catch (error) {
    if (isTransactionConflict(error) || !isConditionFailure(error)) throw error;
    const reasons = cancellationReasons(error);
    if (reasons[3] === 'ConditionalCheckFailed') return 'SCAN_USED';
    if (reasons[1] === 'ConditionalCheckFailed' || reasons[4] === 'ConditionalCheckFailed')
      return 'ALREADY_PLAYED';
    if (reasons[2] === 'ConditionalCheckFailed') return 'SCREEN_BUSY';
    throw error;
  }
}

/**
 * BUSY: the write kept colliding with other writes; the caller draws again.
 * GUARD: the name (or a guest's phone) already played this session; nothing was saved.
 */
export type PlayFailure = 'NOT_READY' | 'PRIZE_TAKEN' | 'BUSY' | 'GUARD';

/**
 * Stores a play result in one transaction. With a prize: the allocation is decremented only if
 * something is left, and the reference is created once. A `PRIZE_TAKEN` result means another play
 * took the last unit at the same moment, so the caller draws again.
 */
export async function savePlay(input: {
  entry: Entry;
  playedAt: string;
  prize: { prizeId: string; isMainPrize: boolean } | null;
  reference: string | null;
  player: PlayerDetails | null;
  /** Colombo date, set when the repeat-winner rule must remember a main prize */
  rememberMainPrizeOn: string | null;
  /** Session guards written with the play (claims-repo): the play fails if one is taken */
  guards?: TransactItem[];
}): Promise<PlayFailure | null> {
  const { entry, prize, reference, playedAt, player } = input;
  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
    {
      Update: {
        TableName: T(),
        Key: keys.entry(entry.entryId),
        UpdateExpression:
          'SET #status = :played, playedAt = :at, prizeId = :prize, #reference = :ref, player = :player, GSI1PK = :g1pk, GSI1SK = :g1sk',
        ConditionExpression: '#status = :ready',
        // `status` and `reference` are DynamoDB reserved words
        ExpressionAttributeNames: { '#status': 'status', '#reference': 'reference' },
        ExpressionAttributeValues: {
          ':played': 'played',
          ':ready': 'ready',
          ':at': playedAt,
          ':prize': prize?.prizeId ?? null,
          ':ref': reference,
          ':player': player,
          ':g1pk': `SESSION#${entry.sessionId}`,
          ':g1sk': `PLAYED#${playedAt}#${entry.entryId}`,
        },
      },
    },
  ];
  if (prize && reference) {
    items.push(
      {
        Update: {
          TableName: T(),
          Key: keys.allocation(entry.sessionId, entry.game, prize.prizeId),
          UpdateExpression: 'SET remaining = remaining - :one, given = given + :one',
          ConditionExpression: 'remaining > :zero',
          ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
        },
      },
      {
        Put: {
          TableName: T(),
          Item: {
            ...keys.reference(reference),
            reference,
            entryId: entry.entryId,
            userId: entry.userId,
            sessionId: entry.sessionId,
            game: entry.game,
            prizeId: prize.prizeId,
            player,
            wonAt: playedAt,
            collectedAt: null,
            collectedBy: null,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    );
    if (prize.isMainPrize && input.rememberMainPrizeOn) {
      items.push({
        Put: {
          TableName: T(),
          Item: {
            ...keys.mainPrizeToday(entry.userId, input.rememberMainPrizeOn),
            prizeId: prize.prizeId,
            wonAt: playedAt,
          },
        },
      });
    }
  }
  const firstGuard = items.length;
  items.push(...(input.guards ?? []));

  try {
    await retryOnConflict(() => db.send(new TransactWriteCommand({ TransactItems: items })));
    return null;
  } catch (error) {
    if (isTransactionConflict(error)) return 'BUSY';
    if (!isConditionFailure(error)) throw error;
    const reasons = cancellationReasons(error);
    if (reasons[0] === 'ConditionalCheckFailed') return 'NOT_READY';
    if (reasons[1] === 'ConditionalCheckFailed' && firstGuard > 1) return 'PRIZE_TAKEN';
    if (reasons.some((r, i) => i >= firstGuard && r === 'ConditionalCheckFailed')) return 'GUARD';
    throw error;
  }
}

/**
 * Adds the phone a QuickLook winner typed after the win, to the play and to its prize reference.
 * Only once, and only while the prize is not collected. Returns false otherwise.
 */
export async function saveWinnerPhone(entryId: string, reference: string, phone: string): Promise<boolean> {
  try {
    await retryOnConflict(() =>
      db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: T(),
                Key: keys.entry(entryId),
                UpdateExpression: 'SET player.phone = :phone',
                ConditionExpression: '#reference = :ref AND player.phone = :empty',
                ExpressionAttributeNames: { '#reference': 'reference' },
                ExpressionAttributeValues: { ':phone': phone, ':ref': reference, ':empty': '' },
              },
            },
            {
              Update: {
                TableName: T(),
                Key: keys.reference(reference),
                UpdateExpression: 'SET player.phone = :phone',
                ConditionExpression: 'entryId = :entryId AND collectedAt = :null',
                ExpressionAttributeValues: { ':phone': phone, ':entryId': entryId, ':null': null },
              },
            },
          ],
        }),
      ),
    );
    return true;
  } catch (error) {
    if (isTransactionConflict(error) || !isConditionFailure(error)) throw error;
    return false;
  }
}

/** Marks an unplayed entry expired and frees the visitor's play for the session. */
export async function expireEntry(entry: Entry): Promise<void> {
  try {
    await retryOnConflict(() =>
      db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: T(),
                Key: keys.entry(entry.entryId),
                UpdateExpression: 'SET #status = :expired',
                ConditionExpression: '#status = :ready',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':expired': 'expired', ':ready': 'ready' },
              },
            },
            {
              Delete: {
                TableName: T(),
                Key: keys.player(entry.sessionId, entry.userId),
                ConditionExpression: 'entryId = :entryId',
                ExpressionAttributeValues: { ':entryId': entry.entryId },
              },
            },
          ],
        }),
      ),
    );
  } catch (error) {
    if (isTransactionConflict(error) || !isConditionFailure(error)) throw error; // else already played or expired
  }
  await releaseLock(entry.lockKey, entry.entryId);
}

/** Releases a screen lock if this entry still holds it. */
export async function releaseLock(lockKey: string, entryId: string): Promise<boolean> {
  try {
    await retryOnConflict(() =>
      db.send(
        new DeleteCommand({
          TableName: T(),
          Key: keys.lock(lockKey),
          ConditionExpression: 'entryId = :entryId',
          ExpressionAttributeValues: { ':entryId': entryId },
        }),
      ),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/** Keeps the lock until the result animation can finish on the screen. */
export async function extendLock(lockKey: string, entryId: string, expiresAt: string): Promise<void> {
  await retryOnConflict(() =>
    db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.lock(lockKey),
        UpdateExpression: 'SET expiresAt = :expiresAt',
        ConditionExpression: 'entryId = :entryId',
        ExpressionAttributeValues: { ':expiresAt': expiresAt, ':entryId': entryId },
      }),
    ),
  ).catch((error) => {
    if (!isConditionFailure(error)) throw error;
  });
}

export interface Lock {
  lockKey: string;
  entryId: string;
  game: Game;
  expiresAt: string;
}

export async function listLocks(): Promise<Lock[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: T(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LOCK' },
    }),
  );
  return (result.Items ?? []).map((item) => clean<Lock>(item) as Lock);
}

/** Plays still running on a screen (the visitor is getting ready, or the animation is showing). */
export async function activePlays(games: readonly Game[], now: Date = new Date()): Promise<Lock[]> {
  return (await listLocks()).filter((l) => games.includes(l.game) && new Date(l.expiresAt) > now);
}

export async function hasMainPrizeToday(userId: string, date: string): Promise<boolean> {
  const result = await db.send(new GetCommand({ TableName: T(), Key: keys.mainPrizeToday(userId, date) }));
  return Boolean(result.Item);
}

export interface Reference {
  reference: string;
  entryId: string;
  userId: string;
  sessionId: string;
  game: Game;
  prizeId: string;
  /** Missing on prizes won before player details were asked */
  player?: PlayerDetails | null;
  wonAt: string;
  collectedAt: string | null;
  collectedBy: string | null;
  /** Set when the prize was taken back: it can no longer be collected */
  voided?: Voided | null;
}

export async function getReference(reference: string): Promise<Reference | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: T(), Key: keys.reference(reference), ConsistentRead: true }),
  );
  return clean<Reference>(result.Item);
}

/** Marks a prize collected. Returns false if it was already collected. */
export async function collectReference(reference: string, by: string, at: string): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: T(),
        Key: keys.reference(reference),
        UpdateExpression: 'SET collectedAt = :at, collectedBy = :by',
        ConditionExpression: 'attribute_exists(PK) AND collectedAt = :null',
        ExpressionAttributeValues: { ':at': at, ':by': by, ':null': null },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/** Plays of a session, newest first (reports and the live feed). */
export async function listPlays(sessionId: string, limit = 500): Promise<Entry[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: T(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []).map((item) => clean<Entry>(item) as Entry);
}

/** Plays of one session that won a prize (prize desk name search). */
export async function listWins(sessionId: string): Promise<Entry[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(
      new QueryCommand({
        TableName: T(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :played)',
        FilterExpression: 'attribute_type(#reference, :string)',
        ExpressionAttributeNames: { '#reference': 'reference' },
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}`, ':played': 'PLAYED#', ':string': 'S' },
        ExclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map((item) => clean<Entry>(item) as Entry);
}

export async function countPlays(sessionId: string): Promise<number> {
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
        Select: 'COUNT',
        ExclusiveStartKey: startKey,
      }),
    );
    count += page.Count ?? 0;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return count;
}

/** Any play in the session? (sessions with plays cannot be deleted) */
export async function hasPlays(sessionId: string): Promise<boolean> {
  return (await listPlays(sessionId, 1)).length > 0;
}
