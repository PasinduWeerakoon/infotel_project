/**
 * Anti-cheat guards and prize claims. A guard is a small item written with a condition inside the
 * same transaction as the play or the claim, so two phones at the same moment cannot both pass.
 *
 *   One play per QuickLook account per day   (any session, either game)
 *   One play per name per day                (a second QuickLook account with the same name)
 *   One play per phone per day               (friends swapping one phone between accounts)
 *
 * The day is the session's date (Colombo). Guards are written when a game is played, so a scan
 * that timed out without playing does not count. The session guard in entries-repo still keeps
 * one live entry per account while a visitor gets ready.
 * A prize taken back (a duplicate phone, or reclaimed by staff) keeps the play as a record and
 * goes back to the session's pool.
 */
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { Entry, VoidReason } from '../domain/types.js';
import { cancellationReasons, db, isConditionFailure, isTransactionConflict, retryOnConflict } from './db.js';
import { keys } from './keys.js';

const T = () => env.TABLE_NAME;

export type TransactItem = NonNullable<
  ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
>[number];

/** Put only when the item is missing (the first play today with this account, name or phone) */
const firstUse = (key: Record<string, string>, entryId: string): TransactItem => ({
  Put: { TableName: T(), Item: { ...key, entryId }, ConditionExpression: 'attribute_not_exists(PK)' },
});

/** One play per phone per day (no guard for an empty phone) */
const phoneGuard = (date: string, phone: string, entryId: string): TransactItem[] =>
  phone ? [firstUse(keys.dayPhone(date, phone), entryId)] : [];

/** One play per day for this account and name (normalized), and phone when it is known */
export function dayGuards(input: {
  date: string;
  userId: string;
  name: string;
  phone: string;
  entryId: string;
}): TransactItem[] {
  const { date, userId, name, phone, entryId } = input;
  return [
    firstUse(keys.dayAccount(date, userId), entryId),
    ...(name ? [firstUse(keys.dayName(date, name), entryId)] : []),
    ...phoneGuard(date, phone, entryId),
  ];
}

/**
 * The play this account or name already made today, if any (its entry ID). Checked early, before
 * the screen is taken; the play transaction checks it again.
 */
export async function playedToday(date: string, userId: string, name: string): Promise<string | undefined> {
  for (const Key of [keys.dayAccount(date, userId), ...(name ? [keys.dayName(date, name)] : [])]) {
    const result = await db.send(new GetCommand({ TableName: T(), Key, ConsistentRead: true }));
    if (result.Item) return String(result.Item.entryId);
  }
  return undefined;
}

export type ClaimOutcome = 'claimed' | 'duplicate' | 'not-open';

/**
 * A QuickLook winner gives the phone after the win: saved on the play and on the reference, once.
 * `duplicate`: the phone already played today. `not-open`: already given, collected or taken back.
 */
export async function claimWithPhone(entry: Entry, phone: string, date: string): Promise<ClaimOutcome> {
  const reference = entry.reference as string;
  const items: TransactItem[] = [
    {
      Update: {
        TableName: T(),
        Key: keys.entry(entry.entryId),
        UpdateExpression: 'SET player.phone = :phone',
        ConditionExpression: '#reference = :ref AND player.phone = :empty AND attribute_not_exists(voided)',
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
        ExpressionAttributeValues: { ':phone': phone, ':entryId': entry.entryId, ':null': null },
      },
    },
    ...phoneGuard(date, phone, entry.entryId),
  ];
  try {
    await retryOnConflict(() => db.send(new TransactWriteCommand({ TransactItems: items })));
    return 'claimed';
  } catch (error) {
    if (isTransactionConflict(error) || !isConditionFailure(error)) throw error;
    const reasons = cancellationReasons(error);
    if (reasons[0] === 'ConditionalCheckFailed' || reasons[1] === 'ConditionalCheckFailed') return 'not-open';
    return 'duplicate';
  }
}

/**
 * Takes a prize back. The play keeps its record (a duplicate also keeps the phone it typed), the
 * reference can no longer be collected, and the prize goes back to the session's pool. If the
 * session has ended, the prize counts as not given, so its stock is free for later sessions.
 * False when it was already taken back or collected (nothing changes then).
 */
export async function voidPrize(
  entry: Entry,
  input: { reason: VoidReason; by: string; at: string; phone?: string },
): Promise<boolean> {
  const { prizeId, reference } = entry;
  if (!prizeId || !reference) return false;
  const voided = { reason: input.reason, at: input.at, by: input.by };
  const setPhone = input.phone ? ', player.phone = :phone' : '';
  const phoneValues = input.phone ? { ':phone': input.phone } : {};
  try {
    await retryOnConflict(() =>
      db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: T(),
                Key: keys.entry(entry.entryId),
                UpdateExpression: `SET voided = :voided, voidedPrizeId = :prize, prizeId = :null${setPhone}`,
                ConditionExpression: input.phone
                  ? 'prizeId = :prize AND attribute_not_exists(voided) AND player.phone = :empty'
                  : 'prizeId = :prize AND attribute_not_exists(voided)',
                ExpressionAttributeValues: {
                  ':voided': voided,
                  ':prize': prizeId,
                  ':null': null,
                  ...phoneValues,
                  ...(input.phone ? { ':empty': '' } : {}),
                },
              },
            },
            {
              Update: {
                TableName: T(),
                Key: keys.reference(reference),
                UpdateExpression: `SET voided = :voided${setPhone}`,
                ConditionExpression:
                  'attribute_exists(PK) AND collectedAt = :null AND attribute_not_exists(voided)',
                ExpressionAttributeValues: { ':voided': voided, ':null': null, ...phoneValues },
              },
            },
            {
              Update: {
                TableName: T(),
                Key: keys.allocation(entry.sessionId, entry.game, prizeId),
                UpdateExpression: 'SET remaining = remaining + :one, given = given - :one',
                ConditionExpression: 'given > :zero',
                ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
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
