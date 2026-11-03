/**
 * Scan by redirect: QuickLook opens our page with a temporary token and the scanned logo.
 *
 *   POST /auth/v1/scan-login   { token, logoId }   -> { scanId, url }
 *
 * One call does what the webhook and sign in do together: the token is exchanged for the visitor
 * (mock for now), the visitor is signed in (session cookie), and the scan is recorded and published
 * exactly like a webhook scan, so the Games and Treasure Hunt flows are unchanged.
 *
 * Testing without QuickLook (mock mode): the phone makes up its own test token. The server also
 * keeps it in a long lived cookie and prefers that cookie, so the phone stays the same player even
 * when the browser forgets its local storage (tab closed, storage cleared after a while).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { getLogo } from '../data/logos-repo.js';
import { type Scan, saveScanOnce } from '../data/scans-repo.js';
import { VISITOR_COOKIE, VISITOR_SESSION_SECONDS, signVisitor } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, cookie, json, parseBody } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { nowIso } from '../lib/time.js';
import { publishScanReceived } from '../services/events.js';
import { exchangeToken } from '../services/token-exchange.js';

/** Remembers a phone's test token in mock mode, about a year */
const TEST_DEVICE_COOKIE = 'lkdr_test_device';
const TEST_DEVICE_SECONDS = 400 * 24 * 60 * 60;
const isPhoneTestToken = (token: string) => /^test_[0-9a-f-]{36}$/.test(token);

const input = z.object({
  token: z.string().min(8).max(500),
  logoId: z.string().regex(/^[a-z0-9_-]{2,60}$/),
});

async function scanLogin(req: ApiRequest) {
  const config = await getConfig();
  const body = parseBody(input, req);
  const { logoId } = body;
  // Mock mode: a phone that already has a test identity keeps it, whatever token the page sends
  const remembered = req.cookies[TEST_DEVICE_COOKIE];
  const testDevice =
    config.QL_TOKEN_MODE === 'mock' && isPhoneTestToken(body.token)
      ? remembered && isPhoneTestToken(remembered)
        ? remembered
        : body.token
      : null;
  const token = testDevice ?? body.token;

  const logo = await getLogo(logoId);
  if (!logo || (logo.logoType !== 'game' && logo.logoType !== 'stall')) {
    throw new HttpError(404, 'LOGO_NOT_FOUND', 'This QR code is not part of the games');
  }

  const visitor = await exchangeToken(config, token);
  const now = nowIso();
  const scan: Scan = {
    scanId: `qls_${randomBytes(8).toString('hex')}`,
    eventId: `evt_${randomUUID()}`,
    userId: visitor.userId,
    logoId,
    logoType: logo.logoType,
    targetId: logo.targetId,
    scannedAt: now,
    receivedAt: now,
  };
  await saveScanOnce(scan);
  await publishScanReceived(scan);

  const app = logo.logoType === 'stall' ? config.HUNT_WEB_URL : config.GAMES_WEB_URL;
  const session = await signVisitor(config.secrets.sessionSecret, visitor.userId, visitor.firstName);
  logger.info('Scan by redirect', {
    scanId: scan.scanId,
    logoType: logo.logoType,
    mode: config.QL_TOKEN_MODE,
  });
  return json({ scanId: scan.scanId, url: `${app}/s/${scan.scanId}`, firstName: visitor.firstName }, 200, {
    cookies: [
      cookie(VISITOR_COOKIE, session, {
        maxAgeSeconds: VISITOR_SESSION_SECONDS,
        secure: config.cookieSecure,
        sameSite: 'Lax',
      }),
      ...(testDevice
        ? [
            cookie(TEST_DEVICE_COOKIE, testDevice, {
              maxAgeSeconds: TEST_DEVICE_SECONDS,
              secure: config.cookieSecure,
              sameSite: 'Lax',
            }),
          ]
        : []),
    ],
  });
}

export const scanLoginRoutes: Route[] = [{ method: 'POST', path: '/auth/v1/scan-login', handler: scanLogin }];
