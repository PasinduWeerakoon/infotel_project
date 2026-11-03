/**
 * QuickLook mock: one request handler used by the local server (server.ts) and by AWS Lambda
 * (lambda.ts). Only for development and test environments, never for the live event.
 *
 * Acts like QuickLook on both sides of the integration contract:
 * - OpenID Connect provider: authorize (with prompt=none), token, JWKS, discovery
 * - Name lookup API for the prize desk (client credentials)
 * - Scanning: `/scan/{logoId}` is what a printed QR code opens. It signs the visitor in (once),
 *   sends the signed scan event to the platform API and opens the logo link, like the real app.
 * - Leaderboard API for the Treasure Hunt (leaderboard.ts), with hunt scans from the simulator page.
 *
 * Stateless on purpose: sign-in codes and API tokens are short signed tokens, so any Lambda
 * instance can check them.
 */
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { loadSigningKey } from './keys.js';
import { MOCK_LOGOS, addScan, handleLeaderboard } from './leaderboard.js';
import { demoPage, scanSignInPage, signInPage, simulatorPage } from './pages.js';
import { USERS } from './users.js';

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: string;
  /** Public origin of this mock, for example https://abc.lambda-url.ap-south-1.on.aws */
  origin: string;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
}

const env = {
  clientId: process.env.QL_CLIENT_ID ?? 'lkdr-local',
  clientSecret: process.env.QL_CLIENT_SECRET ?? 'local-client-secret',
  webhookSecret: process.env.QL_WEBHOOK_SECRET ?? 'test_secret_do_not_use_in_production',
  platformUrl: process.env.PLATFORM_URL ?? 'http://localhost:4000',
  gamesUrl: process.env.GAMES_WEB_URL ?? 'http://localhost:5173',
  huntUrl: process.env.HUNT_WEB_URL ?? 'http://localhost:5174',
  adminUrl: process.env.ADMIN_WEB_URL ?? 'http://localhost:5175',
  screensUrl: process.env.SCREEN_WEB_URL ?? 'http://localhost:5176',
};

const signing = loadSigningKey();
const hmacKey = new TextEncoder().encode(env.clientSecret);

const html = (body: string, status = 200, cookies: string[] = []): MockResponse => ({
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  cookies,
  body,
});
const json = (body: unknown, status = 200): MockResponse => ({
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  cookies: [],
  body: JSON.stringify(body),
});
const redirect = (location: string, cookies: string[] = []): MockResponse => ({
  status: 302,
  headers: { location, 'cache-control': 'no-store' },
  cookies,
  body: '',
});

const userCookie = (req: MockRequest, sub: string) =>
  `ql_user=${sub}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${req.origin.startsWith('https') ? '; Secure' : ''}`;
const signedInUser = (req: MockRequest) => {
  const sub = /ql_user=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  return USERS.some((u) => u.sub === sub) ? sub : undefined;
};

/** Sign-in code as a signed token: valid for 2 minutes, bound to the PKCE challenge and redirect. */
async function issueCode(req: MockRequest, params: URLSearchParams, sub: string): Promise<MockResponse> {
  const code = await new SignJWT({
    typ: 'code',
    nonce: params.get('nonce') ?? '',
    redirectUri: params.get('redirect_uri') ?? '',
    challenge: params.get('code_challenge') ?? '',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('2m')
    .sign(hmacKey);
  const target = new URL(params.get('redirect_uri') ?? '');
  target.search = new URLSearchParams({ code, state: params.get('state') ?? '' }).toString();
  return redirect(target.toString(), [userCookie(req, sub)]);
}

/** Sends a signed scan event to the platform (the real webhook contract). */
async function sendScanEvent(sub: string, logoId: string, scanId: string): Promise<number> {
  const body = JSON.stringify({
    eventId: `evt_${randomUUID()}`,
    eventType: 'logo.scanned',
    occurredAt: new Date().toISOString(),
    scan: { scanId, logoId },
    user: { sub },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1=${createHmac('sha256', env.webhookSecret).update(`${timestamp}.${body}`).digest('hex')}`;
  const response = await fetch(`${env.platformUrl}/integrations/quicklook/v1/scan-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ql-event-id': scanId,
      'x-ql-timestamp': timestamp,
      'x-ql-signature': signature,
    },
    body,
  });
  console.log(`Scan event ${scanId} for ${sub} on ${logoId}: ${response.status}`);
  return response.status;
}

interface Logo {
  logoId: string;
  name: string;
  logoType: string;
  imageUrl: string | null;
}

let logoCache: { logos: Logo[]; at: number } | undefined;
async function logos(): Promise<Logo[]> {
  if (logoCache && Date.now() - logoCache.at < 30_000) return logoCache.logos;
  const response = await fetch(`${env.platformUrl}/platform/v1/logos`).catch(() => undefined);
  const items = response?.ok ? ((await response.json()) as { items: Logo[] }).items : [];
  logoCache = { logos: items, at: Date.now() };
  return items;
}

/** Scan a logo as this visitor, then open the right app, like the QuickLook app does. */
async function scanAndOpen(
  req: MockRequest,
  sub: string,
  logoId: string,
  late = false,
): Promise<MockResponse> {
  const logo = (await logos()).find((l) => l.logoId === logoId);
  const app = logo?.logoType === 'stall' ? env.huntUrl : env.gamesUrl;
  const scanId = `qls_${randomBytes(8).toString('hex')}`;
  // Normally the event is sent first. "late" tests the case where the page opens first.
  if (late) setTimeout(() => void sendScanEvent(sub, logoId, scanId), 1500);
  else await sendScanEvent(sub, logoId, scanId);
  return redirect(`${app}/s/${scanId}`, [userCookie(req, sub)]);
}

export async function handle(req: MockRequest): Promise<MockResponse> {
  const { query: params, origin } = req;
  const form = () => new URLSearchParams(req.body);
  const route = `${req.method} ${req.path}`;

  try {
    const leaderboard = handleLeaderboard(req);
    if (leaderboard) return json(leaderboard.body, leaderboard.status);

    // Printed QR codes open /scan/{logoId}
    const scanMatch = /^\/scan\/([a-z0-9_-]+)$/.exec(req.path);
    if (scanMatch) {
      const logoId = scanMatch[1] ?? '';
      const chosen = req.method === 'POST' ? form().get('sub') : signedInUser(req);
      if (chosen && params.get('switch') !== '1') return scanAndOpen(req, chosen, logoId);
      const logo = (await logos()).find((l) => l.logoId === logoId);
      return html(scanSignInPage(USERS, req.path, logo?.name ?? logoId));
    }

    switch (route) {
      case 'GET /.well-known/openid-configuration':
        return json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          jwks_uri: `${origin}/jwks`,
        });

      case 'GET /jwks':
        return json({ keys: [(await signing).publicJwk] });

      case 'GET /authorize': {
        const signedIn = signedInUser(req);
        if (params.get('prompt') === 'none') {
          if (signedIn) return issueCode(req, params, signedIn);
          const target = new URL(params.get('redirect_uri') ?? '');
          target.search = new URLSearchParams({
            error: 'login_required',
            state: params.get('state') ?? '',
          }).toString();
          return redirect(target.toString());
        }
        return html(signInPage(USERS, params.toString()));
      }

      case 'POST /authorize': {
        const body = form();
        return issueCode(
          req,
          new URLSearchParams(body.get('authorize') ?? ''),
          body.get('sub') ?? USERS[0]?.sub ?? '',
        );
      }

      case 'POST /token': {
        const body = form();
        if (body.get('client_id') !== env.clientId || body.get('client_secret') !== env.clientSecret) {
          return json({ error: 'invalid_client' }, 401);
        }
        if (body.get('grant_type') === 'client_credentials') {
          const token = await new SignJWT({ typ: 'api' })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('1h')
            .sign(hmacKey);
          return json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
        }
        let code: {
          sub?: string;
          nonce?: unknown;
          redirectUri?: unknown;
          challenge?: unknown;
          typ?: unknown;
        };
        try {
          code = (await jwtVerify(body.get('code') ?? '', hmacKey)).payload;
        } catch {
          return json({ error: 'invalid_grant' }, 400);
        }
        const challenge = createHash('sha256')
          .update(body.get('code_verifier') ?? '')
          .digest('base64url');
        if (
          code.typ !== 'code' ||
          code.challenge !== challenge ||
          code.redirectUri !== body.get('redirect_uri')
        ) {
          return json({ error: 'invalid_grant' }, 400);
        }
        const user = USERS.find((u) => u.sub === code.sub);
        const { privateKey, publicJwk } = await signing;
        const idToken = await new SignJWT({ nonce: code.nonce, given_name: user?.givenName ?? 'Visitor' })
          .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
          .setIssuer(origin)
          .setAudience(env.clientId)
          .setSubject(code.sub ?? '')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey);
        return json({ id_token: idToken, token_type: 'Bearer', expires_in: 300 });
      }

      case 'GET /': {
        const scannable = (await logos()).filter((l) => l.logoType === 'game' || l.logoType === 'stall');
        return html(simulatorPage(USERS, signedInUser(req), scannable, MOCK_LOGOS, params.get('hunt')));
      }

      case 'GET /demo':
        return html(
          demoPage({ games: env.gamesUrl, hunt: env.huntUrl, admin: env.adminUrl, screens: env.screensUrl }),
        );

      case 'POST /simulate/switch-user':
        return redirect('/', [userCookie(req, form().get('sub') ?? '')]);

      // Treasure Hunt: the scan only reaches QuickLook's leaderboard, like the real app
      case 'POST /simulate/hunt-scan': {
        const sub = signedInUser(req) ?? USERS[0]?.sub ?? '';
        const user = USERS.find((u) => u.sub === sub);
        const logoId = form().get('logoId') ?? '';
        addScan({
          userId: sub,
          fullName: `${user?.givenName ?? 'Test'} Tester`,
          mobile: '0771234567',
          logoId,
        });
        const logo = MOCK_LOGOS.find((l) => l.logo_id === logoId);
        return redirect(`/?hunt=${encodeURIComponent(logo?.product_name ?? logoId)}`);
      }

      case 'POST /simulate/scan': {
        const body = form();
        const sub = signedInUser(req) ?? USERS[0]?.sub ?? '';
        return scanAndOpen(req, sub, body.get('logoId') ?? '', body.get('late') === '1');
      }

      default: {
        const match = /^\/api\/v1\/users\/([^/]+)\/display-name$/.exec(req.path);
        if (req.method === 'GET' && match) {
          try {
            const token = (req.headers.authorization ?? '').replace('Bearer ', '');
            if ((await jwtVerify(token, hmacKey)).payload.typ !== 'api') throw new Error('wrong token');
          } catch {
            return json({ error: 'invalid_token' }, 401);
          }
          const user = USERS.find((u) => u.sub === decodeURIComponent(match[1] ?? ''));
          return user
            ? json({ sub: user.sub, displayName: user.givenName })
            : json({ error: 'not_found' }, 404);
        }
        return json({ error: 'not_found' }, 404);
      }
    }
  } catch (error) {
    console.error(error);
    return json({ error: 'server_error' }, 500);
  }
}
