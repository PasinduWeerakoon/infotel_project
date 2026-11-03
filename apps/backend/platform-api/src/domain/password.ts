/**
 * Admin password hashing with scrypt (built into Node.js, memory-hard, no native modules).
 * Stored format: `scrypt$N$r$p$salt$hash` (salt and hash in base64).
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Admin password rule: at least 10 characters with a letter and a number. */
export function isStrongPassword(password: string): boolean {
  return password.length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
