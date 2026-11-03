/**
 * Stall screens, their keys and their live WebSocket connections.
 * A screen key is shown once when the screen is created and stored only as a SHA-256 hash.
 */
import { createHash } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { Game } from '../domain/types.js';
import { epochSeconds } from '../lib/time.js';
import { db } from './db.js';
import { clean, keys } from './keys.js';

export interface Screen {
  screenId: string;
  name: string;
  games: Game[];
  keyHash: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export const hashKey = (screenKey: string) => createHash('sha256').update(screenKey).digest('hex');

// Screens rarely change and are needed on every entry, so the list is cached for 10 seconds
let cache: { screens: Screen[]; at: number } | undefined;

export async function listScreens(): Promise<Screen[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.screens;
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'SCREEN' },
    }),
  );
  const screens = (result.Items ?? []).map((item) => clean<Screen>(item) as Screen);
  cache = { screens, at: Date.now() };
  return screens;
}

export async function getScreen(screenId: string): Promise<Screen | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.screen(screenId) }));
  return clean<Screen>(result.Item);
}

/**
 * The stall screen showing this game. Its ID is also the lock key, so one player at a time per screen.
 * A stall screen for just this game wins over a main display that follows several games.
 */
export async function screenForGame(game: Game): Promise<Screen | undefined> {
  const showing = (await listScreens()).filter((s) => s.games.includes(game));
  return showing.find((s) => s.games.length === 1) ?? showing[0];
}

export const lockKeyFor = (screen: Screen | undefined, game: Game) => screen?.screenId ?? `game-${game}`;

export async function saveScreen(screen: Screen, previousKeyHash?: string): Promise<void> {
  await db.send(
    new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.screen(screen.screenId), ...screen } }),
  );
  await db.send(
    new PutCommand({
      TableName: env.TABLE_NAME,
      Item: { ...keys.screenKey(screen.keyHash), screenId: screen.screenId },
    }),
  );
  if (previousKeyHash && previousKeyHash !== screen.keyHash) {
    await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.screenKey(previousKeyHash) }));
  }
  cache = undefined;
}

export async function deleteScreen(screen: Screen): Promise<void> {
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.screen(screen.screenId) }));
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.screenKey(screen.keyHash) }));
  cache = undefined;
}

export async function findScreenByKey(screenKey: string): Promise<Screen | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: env.TABLE_NAME, Key: keys.screenKey(hashKey(screenKey)) }),
  );
  return result.Item ? getScreen(String(result.Item.screenId)) : undefined;
}

/**
 * WebSocket connections. A screen can have more than one (a second TV, or a reload that overlaps
 * the old connection), so each connection is its own item.
 */
export async function addConnection(screenId: string, connectionId: string, at: string): Promise<void> {
  const ttl = epochSeconds() + 2 * 86_400;
  await db.send(
    new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.connection(connectionId), screenId, ttl } }),
  );
  await db.send(
    new PutCommand({
      TableName: env.TABLE_NAME,
      Item: { ...keys.screenConnection(screenId, connectionId), connectionId, ttl },
    }),
  );
  await touchScreen(screenId, at);
}

export async function touchScreen(screenId: string, at: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: env.TABLE_NAME,
      Key: keys.screen(screenId),
      UpdateExpression: 'SET lastSeenAt = :at',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':at': at },
    }),
  );
}

export async function screenIdForConnection(connectionId: string): Promise<string | undefined> {
  const result = await db.send(
    new GetCommand({ TableName: env.TABLE_NAME, Key: keys.connection(connectionId) }),
  );
  return result.Item ? String(result.Item.screenId) : undefined;
}

export async function removeConnection(connectionId: string, screenId?: string): Promise<void> {
  const owner = screenId ?? (await screenIdForConnection(connectionId));
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.connection(connectionId) }));
  if (owner) {
    await db.send(
      new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.screenConnection(owner, connectionId) }),
    );
  }
}

export async function listConnections(screenId: string): Promise<string[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `SCREENCONN#${screenId}` },
    }),
  );
  return (result.Items ?? []).map((item) => String(item.connectionId));
}
