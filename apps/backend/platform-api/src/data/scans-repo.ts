/**
 * Scans received from the QuickLook webhook. Stored once per scan ID, kept for 30 days.
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { epochSeconds } from '../lib/time.js';
import { db, isConditionFailure } from './db.js';
import { keys } from './keys.js';

/** game: Spin the Wheel or Lucky Dip. stall: Treasure Hunt stall. display: shown on screens only, never scanned */
export type LogoType = 'game' | 'stall' | 'portal' | 'display' | 'unknown';

export interface Scan {
  scanId: string;
  eventId: string;
  userId: string;
  logoId: string;
  logoType: LogoType;
  /** `spin`, `lucky-dip` or a stall ID */
  targetId: string | null;
  scannedAt: string;
  receivedAt: string;
}

const TTL_DAYS = 30;

/** Stores the scan. Returns false if this scan ID was already stored (a retry from QuickLook). */
export async function saveScanOnce(scan: Scan): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: env.TABLE_NAME,
        Item: { ...keys.scan(scan.scanId), ...scan, ttl: epochSeconds() + TTL_DAYS * 86_400 },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}
