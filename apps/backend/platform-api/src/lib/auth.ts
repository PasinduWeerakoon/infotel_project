/**
 * Visitor and admin sessions.
 *
 * Both are short signed tokens (JWT, HS256) inside HttpOnly cookies. Nothing about the
 * visitor is stored on our side: the cookie carries the opaque QuickLook user ID and the
 * first name only (see docs: 02-architecture/security.md).
 *
 * NOTE: copied into each backend service. The Games and Treasure Hunt APIs only verify.
 */
import { SignJWT, jwtVerify } from 'jose';
import { currentAdminAccount } from './admin-account.js';
import { type ApiRequest, HttpError } from './http.js';

export const VISITOR_COOKIE = 'lkdr_session';
export const ADMIN_COOKIE = 'lkdr_admin';
export const VISITOR_SESSION_SECONDS = 30 * 60;
export const ADMIN_SESSION_SECONDS = 30 * 60;

export type AdminRole =
  | 'super-admin'
  | 'event-admin'
  | 'games-admin'
  | 'hunt-admin'
  | 'prize-desk'
  | 'viewer';
export const ADMIN_ROLES: AdminRole[] = [
  'super-admin',
  'event-admin',
  'games-admin',
  'hunt-admin',
  'prize-desk',
  'viewer',
];

/** An event admin runs both the games and the hunt, without user management */
const COVERS: Partial<Record<AdminRole, AdminRole[]>> = { 'event-admin': ['games-admin', 'hunt-admin'] };

/** Super admins may do everything, other roles what `allowed` lists (or a role they cover) */
export function roleAllows(role: AdminRole, allowed: AdminRole[]): boolean {
  return role === 'super-admin' || [role, ...(COVERS[role] ?? [])].some((r) => allowed.includes(r));
}

export interface Visitor {
  userId: string;
  firstName: string;
  /** True when the name came from a QuickLook partner link: shown as is, the player cannot change it */
  nameLocked: boolean;
  /** Guest players (not signed in to QuickLook): the phone number they signed in with, also locked */
  phone: string | null;
  expiresAt: number;
}

export interface Admin {
  username: string;
  role: AdminRole;
}

const encoder = new TextEncoder();
const key = (secret: string) => encoder.encode(secret);

export async function signVisitor(
  secret: string,
  userId: string,
  name: string,
  nameLocked = false,
  phone: string | null = null,
): Promise<string> {
  return new SignJWT({
    typ: 'visitor',
    name: name.slice(0, 60),
    ...(nameLocked ? { nl: true } : {}),
    ...(phone ? { ph: phone } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${VISITOR_SESSION_SECONDS}s`)
    .sign(key(secret));
}

export async function signAdmin(secret: string, admin: Admin): Promise<string> {
  return new SignJWT({ typ: 'admin', role: admin.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(admin.username)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the signed-in visitor or throws 401 SIGN_IN_REQUIRED. */
export async function requireVisitor(req: ApiRequest, secret: string): Promise<Visitor> {
  const token = req.cookies[VISITOR_COOKIE];
  if (!token) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Please sign in with QuickLook');
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (payload.typ !== 'visitor' || !payload.sub) throw new Error('wrong token type');
    return {
      userId: payload.sub,
      firstName: String(payload.name ?? ''),
      nameLocked: payload.nl === true,
      phone: typeof payload.ph === 'string' ? payload.ph : null,
      expiresAt: payload.exp ?? 0,
    };
  } catch {
    throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Your session has ended. Please sign in again');
  }
}

/**
 * Returns the signed-in admin if their role is allowed. Super admins are always allowed.
 * The custom header blocks cross-site requests (the cookie is also SameSite=Strict).
 */
export async function requireAdmin(req: ApiRequest, secret: string, allowed: AdminRole[]): Promise<Admin> {
  if (req.headers['x-lkdr-admin'] !== '1') throw new HttpError(403, 'FORBIDDEN', 'Missing admin header');
  const token = req.cookies[ADMIN_COOKIE];
  if (!token) throw new HttpError(401, 'ADMIN_SIGN_IN_REQUIRED', 'Please sign in');

  let admin: Admin;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (payload.typ !== 'admin' || !payload.sub) throw new Error('wrong token type');
    admin = { username: payload.sub, role: payload.role as AdminRole };
  } catch {
    throw new HttpError(401, 'ADMIN_SIGN_IN_REQUIRED', 'Your session has ended. Please sign in again');
  }

  // A user disabled or removed since signing in is signed out, and a role change applies at once
  const account = await currentAdminAccount(admin.username);
  if (!account || account.disabled) {
    throw new HttpError(401, 'ADMIN_SIGN_IN_REQUIRED', 'Your session has ended. Please sign in again');
  }
  admin.role = account.role as AdminRole;

  if (!roleAllows(admin.role, allowed)) {
    throw new HttpError(403, 'FORBIDDEN', 'Your role cannot do this');
  }
  return admin;
}
