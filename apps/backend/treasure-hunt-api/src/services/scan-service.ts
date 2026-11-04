/**
 * Handles one scan QuickLook's backend sends (decision D-20):
 * 1. open the message (AES-256-GCM, the key per environment),
 * 2. keep the scan, whatever happens to it,
 * 3. count it when the logo is an event logo and the scan time is inside a session: the first scan
 *    of a logo by a visitor adds a stall, repeats do not.
 */
import { randomBytes } from 'node:crypto';
import { env, getHuntScanKey } from '../config.js';
import { nearbySessions } from '../data/hunt-repo.js';
import { listEventLogos } from '../data/logos-repo.js';
import { bumpStats, recordLogoScan } from '../data/players-repo.js';
import { forgetEvent, rememberEvent, saveScan } from '../data/scans-repo.js';
import { sessionForScan } from '../domain/rules.js';
import { type ScanMessage, openScanMessage } from '../domain/scan-message.js';
import type { ScanResult } from '../domain/types.js';
import { HttpError } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { colomboDate } from '../lib/time.js';

export async function receiveScan(data: string): Promise<{ result: ScanResult | 'already-received' }> {
  const keyHex = await getHuntScanKey();
  if (!keyHex) throw new HttpError(503, 'NOT_READY', 'Scans are not accepted for this environment yet');
  let message: ReturnType<typeof openScanMessage>;
  try {
    message = openScanMessage(data, { keyHex, maxAgeSeconds: env.SCAN_MAX_AGE_SECONDS });
  } catch (error) {
    if (error instanceof HttpError) logger.warn('Scan message refused', { code: error.code });
    throw error;
  }
  if (message.eventId && !(await rememberEvent(message.eventId))) return { result: 'already-received' };
  try {
    return { result: await countAndKeep(message) };
  } catch (error) {
    // Nothing is lost: the event ID is forgotten, so QuickLook's retry of this scan is counted.
    // Counting is exactly once, so a retry never adds a logo twice.
    if (message.eventId) await forgetEvent(message.eventId).catch(() => undefined);
    throw error;
  }
}

async function countAndKeep(message: ScanMessage): Promise<ScanResult> {
  const received = new Date();
  const scanTime = message.scannedAt ?? received;
  const [sessions, logos] = await Promise.all([nearbySessions(), listEventLogos()]);
  const session = sessionForScan(sessions, scanTime);
  const isEventLogo = logos.some((l) => l.logoId === message.logoId);

  let result: ScanResult = 'no-session';
  if (session && !isEventLogo) result = 'unknown-logo';
  if (session && isEventLogo) {
    result = await recordLogoScan({
      sessionId: session.sessionId,
      pointsPerStall: session.pointsPerStall,
      userId: message.userId,
      userName: message.userName,
      logoId: message.logoId,
      at: scanTime.toISOString(),
    });
  }
  if (session) await bumpStats(session.sessionId, received.toISOString());

  await saveScan(
    {
      scanKey: `${received.toISOString()}#${randomBytes(4).toString('hex')}`,
      sessionId: session?.sessionId ?? null,
      userId: message.userId,
      userName: message.userName,
      logoId: message.logoId,
      eventId: message.eventId,
      scannedAt: scanTime.toISOString(),
      receivedAt: received.toISOString(),
      result,
    },
    colomboDate(received),
  );
  return result;
}
