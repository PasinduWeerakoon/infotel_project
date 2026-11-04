/**
 * Reads for the plays report: every play of a session (all pages) and the prize references
 * with their collection status.
 */
import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import type { Entry } from '../domain/types.js';
import { db } from './db.js';
import type { Reference } from './entries-repo.js';
import { clean, keys } from './keys.js';

const T = () => env.TABLE_NAME;

/** Every play of a session, newest first, however many pages it takes */
export async function listAllPlays(sessionId: string): Promise<Entry[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(
      new QueryCommand({
        TableName: T(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map((item) => clean<Entry>(item) as Entry);
}

/** References by ID, 100 per request (the DynamoDB batch limit), retrying what was not read */
export async function getReferences(references: string[]): Promise<Map<string, Reference>> {
  const found = new Map<string, Reference>();
  const unique = [...new Set(references)];
  for (let i = 0; i < unique.length; i += 100) {
    let request: Record<string, unknown>[] | undefined = unique.slice(i, i + 100).map(keys.reference);
    for (let attempt = 0; request?.length && attempt < 8; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
      const result = await db.send(
        new BatchGetCommand({ RequestItems: { [T()]: { Keys: request, ConsistentRead: true } } }),
      );
      for (const item of result.Responses?.[T()] ?? []) {
        const reference = clean<Reference>(item) as Reference;
        found.set(reference.reference, reference);
      }
      request = result.UnprocessedKeys?.[T()]?.Keys as Record<string, unknown>[] | undefined;
    }
    if (request?.length) throw new Error('Could not read every prize reference, please try again');
  }
  return found;
}
