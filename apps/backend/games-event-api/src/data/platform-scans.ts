/**
 * Read access to scans stored by the platform API (shared `platform` table).
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { db } from './db.js';
import { keys } from './keys.js';

export interface PlatformScan {
  scanId: string;
  userId: string;
  logoId: string;
  logoType: string;
  targetId: string | null;
  scannedAt: string;
  usedBy?: string;
}

export async function getScan(scanId: string): Promise<PlatformScan | undefined> {
  const result = await db.send(
    new GetCommand({
      TableName: env.PLATFORM_TABLE_NAME,
      Key: keys.platformScan(scanId),
      ConsistentRead: true,
    }),
  );
  return result.Item as PlatformScan | undefined;
}

/**
 * The scan event and the visitor's page can arrive in any order. If the scan is not stored yet,
 * wait up to 3 seconds for QuickLook's webhook (docs: rules, edge cases).
 */
export async function waitForScan(scanId: string, timeoutMs = 3000): Promise<PlatformScan | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const scan = await getScan(scanId);
    if (scan || Date.now() >= deadline) return scan;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
