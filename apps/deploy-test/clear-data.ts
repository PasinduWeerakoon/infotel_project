/**
 * Empties the test environment's data: every item in the three tables (scans, test players,
 * sessions, plays, prizes, hunt progress, logos, admins) and every uploaded image. The stacks,
 * web apps and secrets stay. reset-data.sh runs this and then loads fresh demo data.
 *
 *   STAGE=dev npx tsx clear-data.ts
 */
import { CloudFormationClient, DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const stage = process.env.STAGE ?? 'dev';
const TABLES = ['platform', 'games-event', 'treasure-hunt'].map((name) => `lkdr-${stage}-${name}`);

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cfn = new CloudFormationClient({});

/** Deletes every item of a table, 25 at a time (the DynamoDB batch limit) */
async function emptyTable(table: string) {
  let deleted = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({ TableName: table, ProjectionExpression: 'PK, SK', ExclusiveStartKey: startKey }),
    );
    const keys = page.Items ?? [];
    for (let i = 0; i < keys.length; i += 25) {
      let requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      // Retry whatever DynamoDB could not process (throttling)
      while (requests.length > 0) {
        const res = await db.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
        requests = (res.UnprocessedItems?.[table] ?? []) as typeof requests;
      }
    }
    deleted += keys.length;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  console.log(`${table}: ${deleted} items deleted`);
}

/** Deletes every uploaded image (logos and prizes) from the platform assets bucket */
async function emptyAssets() {
  const resources = await cfn.send(new DescribeStackResourcesCommand({ StackName: `lkdr-${stage}-platform` }));
  const bucket = resources.StackResources?.find((r) => r.ResourceType === 'AWS::S3::Bucket')?.PhysicalResourceId;
  if (!bucket) throw new Error('Assets bucket not found');
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    const objects = (page.Contents ?? []).map(({ Key }) => ({ Key }));
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    }
    deleted += objects.length;
    token = page.NextContinuationToken;
  } while (token);
  console.log(`${bucket}: ${deleted} images deleted`);
}

await Promise.all(TABLES.map(emptyTable));
await emptyAssets();
