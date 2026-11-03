/**
 * Visitor sign in with QuickLook (OpenID Connect).
 *
 *   GET  /auth/v1/login?app=games&returnTo=/s/{scanId}   start sign in (silent first)
 *   GET  /auth/v1/callback                              finish sign in, set `lkdr_session`
 *   GET  /auth/v1/session                               who is signed in
 *   POST /auth/v1/logout                                clear the session
 *
 * The callback is served on each visitor app's own domain (CloudFront forwards `/auth/*`),
 * so the session cookie belongs to that app and no cross-site cookies are needed.
 */
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { type Config, getConfig } from '../config.js';
import { VISITOR_COOKIE, VISITOR_SESSION_SECONDS, requireVisitor, signVisitor } from '../lib/auth.js';
import {
  type ApiRequest,
  HttpError,
  type Route,
  cookie,
  json,
  noContent,
  parseQuery,
  redirect,
} from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { authorizationUrl, completeLogin, createLoginSecrets } from '../services/quicklook.js';

const LOGIN_COOKIE = 'lkdr_login';
const LOGIN_COOKIE_SECONDS = 10 * 60;

type App = 'games' | 'hunt';

const loginQuery = z.object({
  app: z.enum(['games', 'hunt']).default('games'),
  // Only same-site paths are accepted, so this can never become an open redirect
  returnTo: z
    .string()
    .regex(/^\/(?!\/)[\w\-./?=&%]*$/)
    .default('/'),
  interactive: z.enum(['0', '1']).default('0'),
});

const appUrl = (config: Config, app: App) => (app === 'games' ? config.GAMES_WEB_URL : config.HUNT_WEB_URL);
const redirectUri = (config: Config, app: App) => `${appUrl(config, app)}/auth/v1/callback`;

const encoder = new TextEncoder();

interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
  app: App;
  returnTo: string;
  silent: boolean;
}

async function sealLoginState(config: Config, state: LoginState): Promise<string> {
  return new SignJWT({ typ: 'login', ...state })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${LOGIN_COOKIE_SECONDS}s`)
    .sign(encoder.encode(config.secrets.sessionSecret));
}

async function openLoginState(config: Config, token: string | undefined): Promise<LoginState> {
  if (!token)
    throw new HttpError(400, 'SIGN_IN_EXPIRED', 'Sign in took too long. Please scan the logo again');
  try {
    const { payload } = await jwtVerify(token, encoder.encode(config.secrets.sessionSecret));
    if (payload.typ !== 'login') throw new Error('wrong token type');
    return payload as unknown as LoginState;
  } catch {
    throw new HttpError(400, 'SIGN_IN_EXPIRED', 'Sign in took too long. Please scan the logo again');
  }
}

async function startLogin(config: Config, app: App, returnTo: string, silent: boolean) {
  const secrets = createLoginSecrets();
  const sealed = await sealLoginState(config, { ...secrets, app, returnTo, silent });
  const url = await authorizationUrl({ ...secrets, redirectUri: redirectUri(config, app), silent });
  const loginCookie = cookie(LOGIN_COOKIE, sealed, {
    maxAgeSeconds: LOGIN_COOKIE_SECONDS,
    secure: config.cookieSecure,
    sameSite: 'Lax',
    path: '/auth/v1',
  });
  return redirect(url, [loginCookie]);
}

async function login(req: ApiRequest) {
  const config = await getConfig();
  const query = parseQuery(loginQuery, req);
  return startLogin(config, query.app, query.returnTo, query.interactive === '0');
}

async function callback(req: ApiRequest) {
  const config = await getConfig();
  const login = await openLoginState(config, req.cookies[LOGIN_COOKIE]);
  if (req.query.state !== login.state) {
    throw new HttpError(400, 'SIGN_IN_FAILED', 'Sign in could not be verified. Please scan the logo again');
  }

  // Silent sign in failed because the visitor is not signed in to QuickLook: show the login page once
  if (req.query.error === 'login_required' && login.silent) {
    return startLogin(config, login.app, login.returnTo, false);
  }
  if (req.query.error || !req.query.code) {
    logger.warn('QuickLook sign in error', { error: req.query.error });
    return redirect(`${appUrl(config, login.app)}/signin-failed`);
  }

  const user = await completeLogin(config, {
    code: req.query.code,
    redirectUri: redirectUri(config, login.app),
    verifier: login.verifier,
    nonce: login.nonce,
  });
  const token = await signVisitor(config.secrets.sessionSecret, user.userId, user.firstName);
  const cookies = [
    cookie(VISITOR_COOKIE, token, {
      maxAgeSeconds: VISITOR_SESSION_SECONDS,
      secure: config.cookieSecure,
      sameSite: 'Lax',
    }),
    cookie(LOGIN_COOKIE, '', {
      maxAgeSeconds: 0,
      secure: config.cookieSecure,
      sameSite: 'Lax',
      path: '/auth/v1',
    }),
  ];
  return redirect(`${appUrl(config, login.app)}${login.returnTo}`, cookies);
}

async function session(req: ApiRequest) {
  const config = await getConfig();
  const visitor = await requireVisitor(req, config.secrets.sessionSecret);
  return json({
    firstName: visitor.firstName,
    expiresAt: new Date(visitor.expiresAt * 1000).toISOString(),
  });
}

async function logout() {
  const config = await getConfig();
  return noContent({
    cookies: [cookie(VISITOR_COOKIE, '', { maxAgeSeconds: 0, secure: config.cookieSecure, sameSite: 'Lax' })],
  });
}

export const visitorAuthRoutes: Route[] = [
  { method: 'GET', path: '/auth/v1/login', handler: login },
  { method: 'GET', path: '/auth/v1/callback', handler: callback },
  { method: 'GET', path: '/auth/v1/session', handler: session },
  { method: 'POST', path: '/auth/v1/logout', handler: logout },
];
