/**
 * Logo registry: every QuickLook logo we accept, what it opens, and its (changeable) image.
 * Read often (screens and apps), written rarely, so lists are cached in memory for 15 seconds.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { db } from './db.js';
import { keys } from './keys.js';
import type { LogoType } from './scans-repo.js';

export interface Logo {
  logoId: string;
  name: string;
  logoType: Exclude<LogoType, 'unknown'>;
  /** `spin` or `lucky-dip` (game), a stall ID (stall), `event` or `hunt` (display) */
  targetId: string | null;
  /** Uploaded image key in the assets bucket */
  imageKey: string | null;
  updatedAt: string;
}

let cache: { logos: Logo[]; at: number } | undefined;
const CACHE_MS = 15_000;

export async function listLogos(): Promise<Logo[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.logos;
  const result = await db.send(
    new QueryCommand({
      TableName: env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LOGO' },
    }),
  );
  const logos = (result.Items ?? []).map(toLogo);
  cache = { logos, at: Date.now() };
  return logos;
}

export async function getLogo(logoId: string): Promise<Logo | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.TABLE_NAME, Key: keys.logo(logoId) }));
  return result.Item ? toLogo(result.Item) : undefined;
}

export async function saveLogo(logo: Logo): Promise<void> {
  await db.send(new PutCommand({ TableName: env.TABLE_NAME, Item: { ...keys.logo(logo.logoId), ...logo } }));
  cache = undefined;
}

export async function deleteLogo(logoId: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: env.TABLE_NAME, Key: keys.logo(logoId) }));
  cache = undefined;
}

function toLogo(item: Record<string, unknown>): Logo {
  return {
    logoId: String(item.logoId),
    name: String(item.name),
    logoType: item.logoType as Logo['logoType'],
    targetId: (item.targetId as string | null) ?? null,
    imageKey: (item.imageKey as string | null) ?? null,
    updatedAt: String(item.updatedAt),
  };
}
