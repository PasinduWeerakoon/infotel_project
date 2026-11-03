/**
 * Clears the activity of a test environment but keeps its setup.
 *
 * Keeps:   admin accounts, logos, prizes, game settings, stall screens with their keys and live
 *          screen connections, uploaded images.
 * Deletes: game sessions (with allocations and player guards), plays, prize references, screen
 *          locks, daily main-prize records, scans, test visitors, hunt sessions, standings, winners
 *          and old stall records.
 *
 * Dry run first (counts only), then --apply:
 *   AWS_PROFILE=1bt-training EXPECTED_ACCOUNT=550586832874 npx tsx clear-activity.ts
 *   AWS_PROFILE=1bt-training EXPECTED_ACCOUNT=550586832874 npx tsx clear-activity.ts --apply
 */
import { execFileSync } from 'node:child_process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-south-1';
const stage = process.env.STAGE ?? 'dev';
const apply = process.argv.includes('--apply');

const account = execFileSync('aws', ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'])
  .toString()
  .trim();
if (!process.env.EXPECTED_ACCOUNT || account !== process.env.EXPECTED_ACCOUNT) {
  throw new Error(`Set EXPECTED_ACCOUNT. The profile is account ${account}`);
}

/** Item partition keys that are setup, never deleted, per table */
const KEEP: Record<string, (pk: string) => boolean> = {
  platform: (pk) => pk === 'ADMIN' || pk === 'LOGO' || pk.startsWith('ADMINLOCK'),
  'games-event': (pk) =>
    pk === 'PRIZE' ||
    pk === 'SETTINGS' ||
    pk === 'SCREEN' ||
    pk.startsWith('SCREENKEY#') ||
    pk.startsWith('SCREENCONN#') ||
    pk.startsWith('CONN#'),
  'treasure-hunt': () => false,
};

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const kind = (pk: string) => pk.replace(/#.*/, '');

async function clearTable(name: string, keep: (pk: string) => boolean) {
  const table = `lkdr-${stage}-${name}`;
  const doomed: { PK: string; SK: string }[] = [];
  const kept = new Map<string, number>();
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({ TableName: table, ProjectionExpression: 'PK, SK', ExclusiveStartKey: startKey }),
    );
    for (const item of (page.Items ?? []) as { PK: string; SK: string }[]) {
      if (keep(item.PK)) kept.set(kind(item.PK), (kept.get(kind(item.PK)) ?? 0) + 1);
      else doomed.push(item);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  const byKind = new Map<string, number>();
  for (const item of doomed) byKind.set(kind(item.PK), (byKind.get(kind(item.PK)) ?? 0) + 1);
  console.log(`${table}`);
  console.log(`  keep:   ${[...kept].map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'}`);
  console.log(`  delete: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'}`);
  if (!apply) return;

  for (let i = 0; i < doomed.length; i += 25) {
    let requests = doomed.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    // Retry whatever DynamoDB could not process (throttling)
    while (requests.length > 0) {
      const res = await db.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      requests = (res.UnprocessedItems?.[table] ?? []) as typeof requests;
    }
  }
  console.log(`  deleted ${doomed.length} items`);
}

console.log(`${apply ? 'Clearing' : 'Dry run for'} account ${account}, stage ${stage}`);
for (const [name, keep] of Object.entries(KEEP)) await clearTable(name, keep);
if (!apply) console.log('\nNothing deleted. Run again with --apply to delete.');
