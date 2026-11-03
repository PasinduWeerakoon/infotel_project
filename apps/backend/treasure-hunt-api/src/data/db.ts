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
