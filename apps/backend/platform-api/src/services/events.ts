/**
 * Publishes `scan.received` after a new scan is stored.
 *
 * In AWS the event goes to the EventBridge bus for any service that wants scans. Locally there is
 * no bus, so nothing is sent. The Treasure Hunt does not use these events: QuickLook counts hunt
 * scans and the hunt reads them from QuickLook's Leaderboard API.
 */
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { env } from '../config.js';
import type { Scan } from '../data/scans-repo.js';
import { logger } from '../lib/logger.js';

const eventBridge = new EventBridgeClient({});

export interface ScanReceivedDetail {
  scanId: string;
  userId: string;
  logoId: string;
  logoType: Scan['logoType'];
  targetId: string | null;
  scannedAt: string;
}

export async function publishScanReceived(scan: Scan): Promise<void> {
  const detail: ScanReceivedDetail = {
    scanId: scan.scanId,
    userId: scan.userId,
    logoId: scan.logoId,
    logoType: scan.logoType,
    targetId: scan.targetId,
    scannedAt: scan.scannedAt,
  };

  if (env.EVENTS_MODE === 'http') return;

  const result = await eventBridge.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: env.EVENT_BUS_NAME,
          Source: 'lkdr.platform',
          DetailType: 'scan.received',
          Detail: JSON.stringify(detail),
        },
      ],
    }),
  );
  // A failed publish throws, so QuickLook gets a 5xx and retries. The scan is already stored,
  // so the retry is answered as a duplicate.
  if (result.FailedEntryCount) throw new Error('EventBridge publish failed');
}
