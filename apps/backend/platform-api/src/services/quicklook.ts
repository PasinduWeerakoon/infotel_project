/**
 * QuickLook client: OpenID Connect sign in (authorization code + PKCE) and the
 * display name lookup used at the prize desk. We never store QuickLook tokens.
 *
 * Discovery data, signing keys (JWKS) and the client credentials token are cached in memory,
 * so a busy Lambda does not call QuickLook on every request.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type Config, env } from '../config.js';
import { HttpError } from '../lib/http.js';

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discovery: Promise<Discovery> | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let apiToken: { value: string; expiresAt: number } | undefined;

async function getDiscovery(): Promise<Discovery> {
  discovery ??= fetchJson<Discovery>(`${env.QL_ISSUER}/.well-known/openid-configuration`).catch((error) => {
    discovery = undefined; // retry on the next request
    throw error;
  });
  return discovery;
}

async function getJwks() {
  jwks ??= createRemoteJWKSet(new URL((await getDiscovery()).jwks_uri), { cacheMaxAge: 60 * 60 * 1000 });
  return jwks;
}

const base64Url = (buffer: Buffer) => buffer.toString('base64url');

/** Random values for one sign in attempt. Kept in a short signed cookie until the callback. */
export function createLoginSecrets() {
  const verifier = base64Url(randomBytes(32));
  return {
    state: base64Url(randomBytes(16)),
    nonce: base64Url(randomBytes(16)),
    verifier,
    challenge: base64Url(createHash('sha256').update(verifier).digest()),
  };
}

export async function authorizationUrl(input: {
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
  silent: boolean;
}): Promise<string> {
  const { authorization_endpoint } = await getDiscovery();
  const url = new URL(authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.QL_CLIENT_ID,
    redirect_uri: input.redirectUri,
    scope: 'openid profile',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    ...(input.silent ? { prompt: 'none' } : {}),
  }).toString();
  return url.toString();
}

/** Exchanges the code and verifies the ID token. Returns the pairwise user ID and first name only. */
export async function completeLogin(
  config: Config,
  input: { code: string; redirectUri: string; verifier: string; nonce: string },
): Promise<{ userId: string; firstName: string }> {
  const { token_endpoint, issuer } = await getDiscovery();
  const tokens = await fetchJson<{ id_token?: string }>(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: env.QL_CLIENT_ID,
      client_secret: config.secrets.qlClientSecret,
      code_verifier: input.verifier,
    }),
  });
  if (!tokens.id_token) throw new HttpError(502, 'QUICKLOOK_ERROR', 'QuickLook did not return an ID token');

  const { payload } = await jwtVerify(tokens.id_token, await getJwks(), {
    issuer,
    audience: env.QL_CLIENT_ID,
  });
  if (payload.nonce !== input.nonce || !payload.sub) {
    throw new HttpError(401, 'SIGN_IN_FAILED', 'Sign in could not be verified. Please try again');
  }
  return { userId: payload.sub, firstName: String(payload.given_name ?? '').slice(0, 40) };
}

/** Display name of one user for the prize desk. Shown to staff, never stored. */
export async function lookupDisplayName(config: Config, userId: string): Promise<string | null> {
  const token = await getApiToken(config);
  const response = await fetch(`${env.QL_API_BASE}/api/v1/users/${encodeURIComponent(userId)}/display-name`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, 'QUICKLOOK_ERROR', 'QuickLook name lookup failed');
  const body = (await response.json()) as { displayName?: string };
  return body.displayName ?? null;
}

async function getApiToken(config: Config): Promise<string> {
  if (apiToken && apiToken.expiresAt > Date.now() + 30_000) return apiToken.value;
  const { token_endpoint } = await getDiscovery();
  const body = await fetchJson<{ access_token: string; expires_in: number }>(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.QL_CLIENT_ID,
      client_secret: config.secrets.qlClientSecret,
    }),
  });
  apiToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return apiToken.value;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (!response.ok)
    throw new HttpError(502, 'QUICKLOOK_ERROR', `QuickLook request failed (${response.status})`);
  return (await response.json()) as T;
}
