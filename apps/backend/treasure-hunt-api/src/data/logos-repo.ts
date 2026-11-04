/**
 * The event logos: loaded once from QuickLook, they count in every session of the event.
 */
import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { EventLogo } from '../domain/types.js';
import { db } from './db.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;

// Read for every scan, so cached for 60 seconds per Lambda instance
let cache: { logos: EventLogo[]; at: number } | undefined;

export async function listEventLogos(): Promise<EventLogo[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.logos;
  const logos: EventLogo[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: T(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'LOGOS' },
        ExclusiveStartKey: startKey,
      }),
    );
    logos.push(...(page.Items ?? []).map((item) => clean<EventLogo>(item) as EventLogo));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  logos.sort((a, b) => a.productName.localeCompare(b.productName));
  cache = { logos, at: Date.now() };
  return logos;
}

/** Adds or updates logos (a logo loaded again keeps its ID, so scans already counted still count) */
export async function saveEventLogos(logos: EventLogo[]): Promise<void> {
  for (let i = 0; i < logos.length; i += 25) {
    let requests = logos
      .slice(i, i + 25)
      .map((logo) => ({ PutRequest: { Item: { ...keys.logo(logo.logoId), ...logo } } }));
    while (requests.length > 0) {
      const result = await db.send(new BatchWriteCommand({ RequestItems: { [T()]: requests } }));
      requests = (result.UnprocessedItems?.[T()] ?? []) as typeof requests;
    }
  }
  cache = undefined;
}
