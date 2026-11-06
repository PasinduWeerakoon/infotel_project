/**
 * Scan by redirect: QuickLook opens our page with a temporary token and the scanned logo.
 *
 *   POST /auth/v1/scan-login   { qUser | token, logoId }   -> { scanId, url, name, nameLocked }
 *   POST /auth/v1/guest-login  { logoId, name, phone }     -> the same (games only)
 *
 * QuickLook partner link (the event): the logo link carries `?qUser=<encrypted user>`. The server
 * opens it (services/partner-link.ts), so the visitor is the QuickLook user and their name is
 * locked. A link without `qUser` means the visitor is not signed in to the QuickLook app. For the
 * two games they can still play as a guest: they type their name and phone, and the phone number is
 * their identity (one play per number per session). The Treasure Hunt needs the QuickLook app.
 *
 * One call does what the webhook and sign in do together: the token is exchanged for the visitor
 * (mock for now), the visitor is signed in (session cookie), and the scan is recorded and published
 * exactly like a webhook scan, so the Games and Treasure Hunt flows are unchanged.
 *
 * Testing without QuickLook (mock mode): the phone makes up its own test token. The server also
 * keeps it in a long lived cookie and prefers that cookie, so the phone stays the same player even
 * when the browser forgets its local storage (tab closed, storage cleared after a while).
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Config, getConfig, getPartnerLinkKey } from '../config.js';
import { type Logo, getLogo } from '../data/logos-repo.js';
import { type Scan, saveScanOnce } from '../data/scans-repo.js';
import { normalizePhone } from '../domain/phone.js';
import { VISITOR_COOKIE, VISITOR_SESSION_SECONDS, signVisitor } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, cookie, json, parseBody } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { LIMITS, rateLimit } from '../lib/rate-limit.js';
import { nowIso } from '../lib/time.js';
import { publishScanReceived } from '../services/events.js';
import { decryptPartnerLink, linkFingerprint } from '../services/partner-link.js';
import { exchangeToken } from '../services/token-exchange.js';

/** Remembers a phone's test token in mock mode, about a year */
const TEST_DEVICE_COOKIE = 'lkdr_test_device';
const TEST_DEVICE_SECONDS = 400 * 24 * 60 * 60;
const isPhoneTestToken = (token: string) => /^test_[0-9a-f-]{36}$/.test(token);

const input = z.object({
  qUser: z.string().min(8).max(4000).optional(),
  token: z.string().min(8).max(500).optional(),
  logoId: z.string().regex(/^[a-z0-9_-]{2,60}$/),
});

const guestInput = z.object({
  logoId: z.string().regex(/^[a-z0-9_-]{2,60}$/),
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(7).max(30),
});

/** A guest player of the two games: name and phone typed on the phone, the phone is the identity */
async function guestLogin(req: ApiRequest) {
  await rateLimit('scan-ip', req.ip, LIMITS.perIp);
  const config = await getConfig();
  const body = parseBody(guestInput, req);
  const logo = await getLogo(body.logoId);
  if (!logo || logo.logoType !== 'game') {
    throw new HttpError(404, 'LOGO_NOT_FOUND', 'This QR code is not part of the games');
  }
  const phone = normalizePhone(body.phone);
  if (!phone) throw new HttpError(422, 'PHONE_INVALID', 'Please check your phone number');
  // Same number, same player. Keyed, so the ID does not give the number away.
  const hash = createHmac('sha256', config.secrets.sessionSecret)
    .update(`guest-phone:${phone}`)
    .digest('hex');
  return signInAndRecord(
    config,
    { userId: `guest_${hash.slice(0, 24)}`, name: body.name, nameLocked: true, phone },
    logo,
    [],
  );
}

async function scanLogin(req: ApiRequest) {
  await rateLimit('scan-ip', req.ip, LIMITS.perIp);
  const config = await getConfig();
  const body = parseBody(input, req);
  const { logoId } = body;
  const logo = await getLogo(logoId);
  if (!logo || (logo.logoType !== 'game' && logo.logoType !== 'stall')) {
    throw new HttpError(404, 'LOGO_NOT_FOUND', 'This QR code is not part of the games');
  }
  if (body.qUser) return partnerLogin(config, body.qUser, logo);
  if (config.QL_TOKEN_MODE !== 'mock' || !body.token) {
    throw new HttpError(
      401,
      'QUICKLOOK_SIGN_IN_REQUIRED',
      'Please sign in to the QuickLook app and scan the logo again',
    );
  }
  // Mock mode: a phone that already has a test identity keeps it, whatever token the page sends
  const remembered = req.cookies[TEST_DEVICE_COOKIE];
  const testDevice =
    config.QL_TOKEN_MODE === 'mock' && isPhoneTestToken(body.token)
      ? remembered && isPhoneTestToken(remembered)
        ? remembered
        : body.token
      : null;
  const token = testDevice ?? body.token;
  const visitor = await exchangeToken(config, token);
  const extraCookies = testDevice
    ? [
        cookie(TEST_DEVICE_COOKIE, testDevice, {
          maxAgeSeconds: TEST_DEVICE_SECONDS,
          secure: config.cookieSecure,
          sameSite: 'Lax',
        }),
      ]
    : [];
  return signInAndRecord(
    config,
    { userId: visitor.userId, name: visitor.firstName, nameLocked: false },
    logo,
    extraCookies,
  );
}

/** The visitor from a QuickLook partner link */
async function partnerLogin(config: Config, qUser: string, logo: Logo) {
  const keyHex = await getPartnerLinkKey();
  if (!keyHex)
    throw new HttpError(503, 'LINK_NOT_READY', 'QuickLook links are not set up yet. Please try again later');
  try {
    const user = decryptPartnerLink(qUser, {
      keyHex,
      maxAgeSeconds: config.PARTNER_LINK_MAX_AGE_SECONDS,
      requireTime: config.PARTNER_LINK_REQUIRE_TIME === 'true',
      logoId: logo.logoId,
    });
    return signInAndRecord(config, { userId: user.userId, name: user.fullName, nameLocked: true }, logo, []);
  } catch (error) {
    if (error instanceof HttpError)
      logger.warn('Partner link refused', { code: error.code, link: linkFingerprint(qUser) });
    throw error;
  }
}

/** Signs the visitor in and records the scan exactly like a webhook scan */
async function signInAndRecord(
  config: Config,
  visitor: { userId: string; name: string; nameLocked: boolean; phone?: string },
  logo: Logo,
  extraCookies: string[],
) {
  const now = nowIso();
  const scan: Scan = {
    scanId: `qls_${randomBytes(8).toString('hex')}`,
    eventId: `evt_${randomUUID()}`,
    userId: visitor.userId,
    logoId: logo.logoId,
    logoType: logo.logoType,
    targetId: logo.targetId,
    scannedAt: now,
    receivedAt: now,
  };
  await saveScanOnce(scan);
  await publishScanReceived(scan);

  const app = logo.logoType === 'stall' ? config.HUNT_WEB_URL : config.GAMES_WEB_URL;
  const session = await signVisitor(
    config.secrets.sessionSecret,
    visitor.userId,
    visitor.name,
    visitor.nameLocked,
    visitor.phone ?? null,
  );
  logger.info('Scan by redirect', {
    scanId: scan.scanId,
    logoType: logo.logoType,
    via: visitor.phone ? 'guest' : visitor.nameLocked ? 'partner-link' : config.QL_TOKEN_MODE,
  });
  const body = {
    scanId: scan.scanId,
    url: `${app}/s/${scan.scanId}`,
    name: visitor.name,
    nameLocked: visitor.nameLocked,
  };
  return json(body, 200, {
    cookies: [
      cookie(VISITOR_COOKIE, session, {
        maxAgeSeconds: VISITOR_SESSION_SECONDS,
        secure: config.cookieSecure,
        sameSite: 'Lax',
      }),
      ...extraCookies,
    ],
  });
}

export const scanLoginRoutes: Route[] = [
  { method: 'POST', path: '/auth/v1/scan-login', handler: scanLogin },
  { method: 'POST', path: '/auth/v1/guest-login', handler: guestLogin },
];
