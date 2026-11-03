/**
 * Test visitors created from mock tokens (QL_TOKEN_MODE=mock). With the real QuickLook token
 * exchange nothing is stored here: QuickLook keeps the visitor's details.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { nowIso } from '../lib/time.js';
import { db } from './db.js';
import { keys } from './keys.js';

export interface Visitor {
  userId: string;
  firstName: string;
  createdAt: string;
  lastSeenAt: string;
}

export async function getVisitor(userId: string): Promise<Visitor | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.visitor(userId) }));
  return result.Item as Visitor | undefined;
}

/** Creates the visitor on first sight, then only updates when they were last seen. */
export async function upsertVisitor(userId: string, firstName: string): Promise<Visitor> {
  const existing = await getVisitor(userId);
  const visitor: Visitor = {
    userId,
    firstName: existing?.firstName ?? firstName,
    createdAt: existing?.createdAt ?? nowIso(),
    lastSeenAt: nowIso(),
  };
  await db.send(new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.visitor(userId), ...visitor } }));
  return visitor;
}
