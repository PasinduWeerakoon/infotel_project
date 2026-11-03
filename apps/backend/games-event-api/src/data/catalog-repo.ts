/**
 * Prize catalogue and global settings.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { DEFAULT_SETTINGS, type Prize, type Settings } from '../domain/types.js';
import { db } from './db.js';
import { clean, keys } from './keys.js';

export async function listPrizes(): Promise<Prize[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'PRIZE' },
    }),
  );
  return (result.Items ?? []).map((item) => clean<Prize>(item) as Prize);
}

export async function getPrize(prizeId: string): Promise<Prize | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.prize(prizeId) }));
  return clean<Prize>(result.Item);
}

export async function savePrize(prize: Prize): Promise<void> {
  await db.send(
    new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.prize(prize.prizeId), ...prize } }),
  );
}

export async function deletePrize(prizeId: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.prize(prizeId) }));
}

// Settings are read on every play, so they are cached for a few seconds per Lambda instance
let settingsCache: { value: Settings; at: number } | undefined;

export async function getSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < 5000) return settingsCache.value;
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.settings() }));
  const stored = clean<Partial<Settings>>(result.Item) ?? {};
  const value: Settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    paused: { ...DEFAULT_SETTINGS.paused, ...stored.paused },
  };
  settingsCache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.send(new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.settings(), ...settings } }));
  settingsCache = undefined;
}
