/**
 * QuickLook scan event webhook (server to server).
 *
 *   POST /integrations/quicklook/v1/scan-events
 *
 * 202  stored (or a duplicate we already have)
 * 400  invalid body, QuickLook must not retry
 * 401  bad signature or timestamp, QuickLook must not retry
 * 5xx  temporary problem, QuickLook retries
 */
import { z } from 'zod';
import { getConfig } from '../config.js';
import { getLogo } from '../data/logos-repo.js';
import { type Scan, saveScanOnce } from '../data/scans-repo.js';
import { verifySignature } from '../domain/signature.js';
import { type ApiRequest, HttpError, type Route, json } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { nowIso, toColomboIso } from '../lib/time.js';
import { publishScanReceived } from '../services/events.js';

const scanEventSchema = z.object({
  eventId: z.string().min(1).max(100),
  eventType: z.literal('logo.scanned'),
  occurredAt: z.string().datetime({ offset: true }),
  scan: z.object({
    scanId: z.string().min(1).max(100),
    logoId: z.string().min(1).max(100),
  }),
  user: z.object({ sub: z.string().min(1).max(200) }),
});

async function receiveScanEvent(req: ApiRequest) {
  const config = await getConfig();

  const check = verifySignature({
    secrets: config.secrets.qlWebhookSecrets,
    timestamp: req.headers['x-ql-timestamp'],
    signature: req.headers['x-ql-signature'],
    rawBody: req.rawBody,
  });
  if (check !== 'valid') {
    logger.warn('Scan event rejected', { reason: check, eventId: req.headers['x-ql-event-id'] });
    throw new HttpError(401, 'INVALID_SIGNATURE', 'Signature or timestamp is not valid');
  }

  const parsed = scanEventSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'INVALID_EVENT', 'Scan event body is not valid');
  const event = parsed.data;

  const logo = await getLogo(event.scan.logoId);
  const scan: Scan = {
    scanId: event.scan.scanId,
    eventId: event.eventId,
    userId: event.user.sub,
    logoId: event.scan.logoId,
    logoType: logo?.logoType ?? 'unknown',
    targetId: logo?.targetId ?? null,
    scannedAt: toColomboIso(new Date(event.occurredAt)),
    receivedAt: nowIso(),
  };

  const isNew = await saveScanOnce(scan);
  if (isNew) await publishScanReceived(scan);

  logger.info('Scan event accepted', { scanId: scan.scanId, logoType: scan.logoType, duplicate: !isNew });
  return json({ status: 'accepted', duplicate: !isNew }, 202);
}

export const scanIntakeRoutes: Route[] = [
  { method: 'POST', path: '/integrations/quicklook/v1/scan-events', handler: receiveScanEvent },
];
