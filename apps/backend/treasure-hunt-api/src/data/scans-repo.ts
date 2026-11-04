/**
 * Every scan QuickLook sends, kept as received (for checks and disputes), and the event IDs that
 * stop a resent scan from being stored twice.
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { ScanRecord } from '../domain/types.js';
import { db, isConditionFailure } from './db.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;
/** Event IDs are remembered for 4 days, longer than the event */
const EVENT_TTL_SECONDS = 4 * 24 * 60 * 60;

/** True the first time an event ID is seen */
export async function rememberEvent(eventId: string): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: T(),
        Item: { ...keys.event(eventId), ttl: Math.floor(Date.now() / 1000) + EVENT_TTL_SECONDS },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

export async function saveScan(scan: ScanRecord, day: string): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: T(),
      Item: { PK: keys.scans(scan.sessionId, day), SK: scan.scanKey, ...scan },
    }),
  );
}

/** Scans of a session, newest first (optionally one visitor's only) */
export async function listScans(sessionId: string, userId?: string, limit = 500): Promise<ScanRecord[]> {
  const items: ScanRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        KeyConditionExpression: 'PK = :pk',
        ...(userId
          ? {
              FilterExpression: 'userId = :user',
              ExpressionAttributeValues: { ':pk': keys.scans(sessionId, ''), ':user': userId },
            }
          : { ExpressionAttributeValues: { ':pk': keys.scans(sessionId, '') } }),
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []).map((item) => clean<ScanRecord>(item) as ScanRecord));
    startKey = page.LastEvaluatedKey;
  } while (startKey && items.length < limit);
  return items.slice(0, limit);
}
