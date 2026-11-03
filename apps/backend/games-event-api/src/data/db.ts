/**
 * DynamoDB document client. Locally it points at DynamoDB Local (see backend/docker-compose.yml).
 *
 * NOTE: copied into each backend service.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT;

const client = new DynamoDBClient({
  ...(endpoint
    ? { endpoint, region: 'local', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
    : {}),
});

export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/** True when a write failed because of its condition expression. */
export function isConditionFailure(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
}

/** For a cancelled transaction, the reason code per item ("ConditionalCheckFailed" or "None"). */
export function cancellationReasons(error: unknown): string[] {
  const reasons = (error as { CancellationReasons?: { Code?: string }[] })?.CancellationReasons ?? [];
  return reasons.map((r) => r.Code ?? 'None');
}

/**
 * True when a write collided with a transaction on the same item. At peak, many visitors scan the
 * same game at once and their writes meet on the screen lock item. Load tested at 300 requests a
 * second: without handling this, about 9% of entry attempts failed with a 500.
 */
export function isTransactionConflict(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  if (name === 'TransactionConflictException') return true;
  return (
    name === 'TransactionCanceledException' && cancellationReasons(error).includes('TransactionConflict')
  );
}

/** Retries a write that collided with a transaction, after a short random wait. */
export async function retryOnConflict<T>(write: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (!isTransactionConflict(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 40));
    }
  }
}
