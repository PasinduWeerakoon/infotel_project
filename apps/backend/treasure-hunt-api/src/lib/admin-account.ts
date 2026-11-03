/**
 * The admin user's current record in the shared platform table, so a disabled user or a changed
 * role takes effect within 15 seconds instead of when the sign-in cookie expires.
 * Cached briefly per Lambda instance to keep requests fast.
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { db } from '../data/db.js';

const CACHE_MS = 15_000;
const cache = new Map<string, { account: AdminAccount | null; at: number }>();

export interface AdminAccount {
  role: string;
  disabled: boolean;
}

export async function currentAdminAccount(username: string): Promise<AdminAccount | null> {
  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.account;
  const result = await db.send(
    new GetCommand({ TableName: env.PLATFORM_TABLE_NAME, Key: { PK: 'ADMIN', SK: `USER#${username}` } }),
  );
  const account = result.Item
    ? { role: String(result.Item.role), disabled: Boolean(result.Item.disabled) }
    : null;
  cache.set(username, { account, at: Date.now() });
  return account;
}
