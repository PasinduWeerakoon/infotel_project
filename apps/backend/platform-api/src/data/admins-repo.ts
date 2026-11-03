/**
 * Built-in admin accounts for the LKDR Admin Dashboard.
 */
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { AdminRole } from '../lib/auth.js';
import { db } from './db.js';
import { keys } from './keys.js';

export interface AdminUser {
  username: string;
  role: AdminRole;
  passwordHash: string;
  disabled: boolean;
  failedLogins: number;
  /** ISO time until which sign in is blocked after too many failed attempts */
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export type PublicAdminUser = Omit<AdminUser, 'passwordHash' | 'failedLogins'>;

export const toPublic = ({
  passwordHash: _hash,
  failedLogins: _failed,
  ...user
}: AdminUser): PublicAdminUser => user;

export async function getAdmin(username: string): Promise<AdminUser | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.admin(username) }));
  return result.Item as AdminUser | undefined;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'ADMIN' },
    }),
  );
  return (result.Items ?? []) as AdminUser[];
}

/** Creates a user. Fails with ConditionalCheckFailed if the username is taken. */
export async function createAdmin(user: AdminUser): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: env.TABLE_NAME,
      Item: { ...keys.admin(user.username), ...user },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

/** Updates selected fields of an existing user. */
export async function updateAdmin(
  username: string,
  fields: Partial<Omit<AdminUser, 'username'>>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await db.send(
    new UpdateCommand({
      TableName: env.TABLE_NAME,
      Key: keys.admin(username),
      UpdateExpression: `SET ${entries.map(([name]) => `#${name} = :${name}`).join(', ')}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([name]) => [`#${name}`, name])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([name, value]) => [`:${name}`, value])),
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}
