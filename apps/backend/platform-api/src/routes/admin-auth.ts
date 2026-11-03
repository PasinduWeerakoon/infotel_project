/**
 * Admin sign in and admin users.
 *
 *   POST /admin/v1/auth/login      username + password, sets `lkdr_admin`
 *   POST /admin/v1/auth/logout
 *   GET  /admin/v1/auth/me         current admin, also renews the 30 minute session
 *   GET  /admin/v1/users           super admin
 *   POST /admin/v1/users           super admin
 *   PUT  /admin/v1/users/:username super admin (role, disable, reset password, unlock)
 */
import { z } from 'zod';
import { type Config, getConfig } from '../config.js';
import { createAdmin, getAdmin, listAdmins, toPublic, updateAdmin } from '../data/admins-repo.js';
import { isConditionFailure } from '../data/db.js';
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  hashPassword,
  isStrongPassword,
  verifyPassword,
} from '../domain/password.js';
import {
  ADMIN_COOKIE,
  ADMIN_ROLES,
  ADMIN_SESSION_SECONDS,
  type Admin,
  requireAdmin,
  signAdmin,
} from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, cookie, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { addSeconds, ms, nowIso } from '../lib/time.js';

const roleSchema = z.enum(ADMIN_ROLES as [string, ...string[]]);
const usernameSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9._-]+$/, 'Use lower case letters, numbers, dots, dashes or underscores');
const passwordSchema = z
  .string()
  .refine(isStrongPassword, 'At least 10 characters with a letter and a number');

async function adminCookie(config: Config, admin: Admin): Promise<string> {
  const token = await signAdmin(config.secrets.adminSecret, admin);
  return cookie(ADMIN_COOKIE, token, {
    maxAgeSeconds: ADMIN_SESSION_SECONDS,
    secure: config.cookieSecure,
    sameSite: 'Strict',
  });
}

const INVALID_LOGIN = new HttpError(401, 'INVALID_LOGIN', 'Wrong username or password');

async function login(req: ApiRequest) {
  const config = await getConfig();
  const { username, password } = parseBody(z.object({ username: z.string(), password: z.string() }), req);
  const user = await getAdmin(username.trim().toLowerCase());

  if (!user || user.disabled) throw INVALID_LOGIN;
  if (user.lockedUntil && ms(user.lockedUntil) > Date.now()) {
    throw new HttpError(
      423,
      'ACCOUNT_LOCKED',
      `Too many attempts. Try again after ${LOCKOUT_MINUTES} minutes`,
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failedLogins = user.failedLogins + 1;
    const locked = failedLogins >= MAX_FAILED_LOGINS;
    await updateAdmin(user.username, {
      failedLogins: locked ? 0 : failedLogins,
      lockedUntil: locked ? addSeconds(nowIso(), LOCKOUT_MINUTES * 60) : user.lockedUntil,
    });
    audit('admin.login.failed', user.username, { locked });
    throw INVALID_LOGIN;
  }

  await updateAdmin(user.username, { failedLogins: 0, lockedUntil: null, lastLoginAt: nowIso() });
  audit('admin.login', user.username);
  const admin = { username: user.username, role: user.role };
  return json(admin, 200, { cookies: [await adminCookie(config, admin)] });
}

async function logout() {
  const config = await getConfig();
  return noContent({
    cookies: [
      cookie(ADMIN_COOKIE, '', { maxAgeSeconds: 0, secure: config.cookieSecure, sameSite: 'Strict' }),
    ],
  });
}

async function me(req: ApiRequest) {
  const config = await getConfig();
  const admin = await requireAdmin(req, config.secrets.adminSecret, ADMIN_ROLES);
  const user = await getAdmin(admin.username);
  if (!user || user.disabled) throw new HttpError(401, 'ADMIN_SIGN_IN_REQUIRED', 'Please sign in');
  // Role changes take effect on the next renewal
  const fresh = { username: user.username, role: user.role };
  return json(fresh, 200, { cookies: [await adminCookie(config, fresh)] });
}

async function listUsers(req: ApiRequest) {
  const config = await getConfig();
  await requireAdmin(req, config.secrets.adminSecret, []);
  const users = await listAdmins();
  return json({ items: users.map(toPublic) });
}

async function createUser(req: ApiRequest) {
  const config = await getConfig();
  const actor = await requireAdmin(req, config.secrets.adminSecret, []);
  const input = parseBody(
    z.object({ username: usernameSchema, role: roleSchema, password: passwordSchema }),
    req,
  );
  try {
    await createAdmin({
      username: input.username,
      role: input.role as Admin['role'],
      passwordHash: await hashPassword(input.password),
      disabled: false,
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: nowIso(),
    });
  } catch (error) {
    if (isConditionFailure(error))
      throw new HttpError(409, 'USERNAME_TAKEN', 'This username is already used');
    throw error;
  }
  audit('admin.user.created', actor.username, { username: input.username, role: input.role });
  return json({ username: input.username, role: input.role }, 201);
}

async function updateUser(req: ApiRequest) {
  const config = await getConfig();
  const actor = await requireAdmin(req, config.secrets.adminSecret, []);
  const username = req.params.username ?? '';
  const input = parseBody(
    z.object({
      role: roleSchema.optional(),
      disabled: z.boolean().optional(),
      password: passwordSchema.optional(),
      unlock: z.boolean().optional(),
    }),
    req,
  );
  if (username === actor.username && (input.disabled || (input.role && input.role !== 'super-admin'))) {
    throw new HttpError(
      409,
      'CANNOT_CHANGE_SELF',
      'You cannot disable yourself or remove your own super admin role',
    );
  }
  if (!(await getAdmin(username))) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');

  await updateAdmin(username, {
    role: input.role as Admin['role'] | undefined,
    disabled: input.disabled,
    passwordHash: input.password ? await hashPassword(input.password) : undefined,
    ...(input.unlock ? { lockedUntil: null, failedLogins: 0 } : {}),
  });
  audit('admin.user.updated', actor.username, {
    username,
    role: input.role,
    disabled: input.disabled,
    passwordReset: Boolean(input.password),
    unlocked: Boolean(input.unlock),
  });
  const updated = await getAdmin(username);
  if (!updated) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  return json(toPublic(updated));
}

export const adminAuthRoutes: Route[] = [
  { method: 'POST', path: '/admin/v1/auth/login', handler: login },
  { method: 'POST', path: '/admin/v1/auth/logout', handler: logout },
  { method: 'GET', path: '/admin/v1/auth/me', handler: me },
  { method: 'GET', path: '/admin/v1/users', handler: listUsers },
  { method: 'POST', path: '/admin/v1/users', handler: createUser },
  { method: 'PUT', path: '/admin/v1/users/:username', handler: updateUser },
];
