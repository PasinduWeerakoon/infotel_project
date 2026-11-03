/**
 * Turns the temporary token from a QuickLook redirect into a visitor.
 *
 * mock (now): any token becomes a test user. The same token always gives the same user, so one
 *   phone is one player. The user is stored in our table.
 * quicklook (later): calls QuickLook's token exchange API with our client credentials. The exact
 *   endpoint and response are to be agreed with QuickLook (integration contract, part C).
 */
import { createHash } from 'node:crypto';
import { type Config, env } from '../config.js';
import { getVisitor, upsertVisitor } from '../data/visitors-repo.js';
import { HttpError } from '../lib/http.js';

export interface ExchangedVisitor {
  userId: string;
  firstName: string;
}

const TEST_NAMES = [
  'Nimal',
  'Kasun',
  'Ayesha',
  'Dilini',
  'Ruwan',
  'Sanduni',
  'Tharindu',
  'Ishara',
  'Chamara',
  'Nadeesha',
  'Pradeep',
  'Shanika',
];

export async function exchangeToken(config: Config, token: string): Promise<ExchangedVisitor> {
  if (config.QL_TOKEN_MODE === 'mock') {
    const hash = createHash('sha256').update(token).digest('hex');
    const userId = `ql_test_${hash.slice(0, 16)}`;
    const name = `${TEST_NAMES[Number.parseInt(hash.slice(16, 20), 16) % TEST_NAMES.length]} ${hash.slice(20, 22).toUpperCase()}`;
    const visitor = await upsertVisitor(userId, name);
    return { userId: visitor.userId, firstName: visitor.firstName };
  }

  // Real QuickLook token exchange (to agree): POST {token} with client credentials, returns the
  // pairwise user ID and first name. Nothing about the visitor is stored on our side.
  const response = await fetch(`${env.QL_API_BASE}/api/v1/tokens/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, clientId: env.QL_CLIENT_ID, clientSecret: config.secrets.qlClientSecret }),
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 400 || response.status === 401) {
    throw new HttpError(401, 'TOKEN_INVALID', 'Please scan the logo again with the QuickLook app');
  }
  if (!response.ok)
    throw new HttpError(502, 'QUICKLOOK_ERROR', 'QuickLook is not reachable. Please try again');
  const body = (await response.json()) as { sub: string; givenName?: string };
  return { userId: body.sub, firstName: (body.givenName ?? '').slice(0, 40) };
}

/** Test users have their name stored here. With real QuickLook the name comes from QuickLook. */
export async function storedTestName(userId: string): Promise<string | null | undefined> {
  if (env.QL_TOKEN_MODE !== 'mock') return undefined;
  return (await getVisitor(userId))?.firstName ?? null;
}
