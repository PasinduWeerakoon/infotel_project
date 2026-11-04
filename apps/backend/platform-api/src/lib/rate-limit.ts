/**
 * Per-client rate limits: a counter per client per minute in this service's DynamoDB table,
 * removed by TTL. Over the limit the request gets HTTP 429.
 *
 * Venue Wi-Fi puts many phones behind one IP address, so the IP limits are generous and the
 * tight limit is per signed-in visitor. If the counter itself fails, the request is allowed:
 * a limit must never stop the event.
 *
 * NOTE: copied into each backend service that limits visitors.
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config.js';
import { db } from '../data/db.js';
import { HttpError } from './http.js';
import { logger } from './logger.js';

/** Requests per minute. 0 turns a limit off (load tests from one machine) */
export const LIMITS = {
  perIp: Number(process.env.RATE_LIMIT_IP_PER_MINUTE ?? 600),
  perVisitor: Number(process.env.RATE_LIMIT_VISITOR_PER_MINUTE ?? 60),
};

/** Counts one request for `scope` + `id` and throws 429 when this minute's count is over `max` */
export async function rateLimit(
  scope: string,
  id: string,
  max: number,
  now: Date = new Date(),
): Promise<void> {
  if (!max || max <= 0 || !id) return;
  const minute = Math.floor(now.getTime() / 60_000);
  let count: number;
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: env.TABLE_NAME,
        Key: { PK: `RATE#${scope}#${id}`, SK: String(minute) },
        UpdateExpression: 'ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':ttl': (minute + 3) * 60 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    count = Number(result.Attributes?.count ?? 0);
  } catch (error) {
    logger.warn('Rate limit counter failed, request allowed', { scope, error });
    return;
  }
  if (count > max) {
    if (count === max + 1) logger.warn('Rate limit reached', { scope, max });
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again', {
      retryAfterSeconds: 60 - (Math.floor(now.getTime() / 1000) % 60),
    });
  }
}
