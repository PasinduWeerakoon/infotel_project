// Empties the LOCAL DynamoDB (localhost:8100 only) and loads the demo data again, so every QA run
// starts from the same state. Never touches AWS.
import { execSync } from 'node:child_process';
import { DeleteTableCommand, DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({
  endpoint: 'http://localhost:8100',
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const { TableNames = [] } = await db.send(new ListTablesCommand({}));
for (const name of TableNames.filter((n) => n.startsWith('lkdr'))) {
  await db.send(new DeleteTableCommand({ TableName: name }));
}
for (const service of ['platform-api', 'games-event-api', 'treasure-hunt-api']) {
  execSync('npm run -s db:setup', { cwd: new URL(`../../backend/${service}`, import.meta.url), stdio: 'inherit' });
}
// The QuickLook mock keeps hunt scans in memory: forget them too (the mock must be running)
const mock = await fetch('http://localhost:4010/_mock/leaderboard/reset', { method: 'POST' }).catch(() => null);
if (!mock?.ok) throw new Error('Start the QuickLook mock first: cd backend/quicklook-mock && npm run dev');
// The APIs cache sessions and settings for a few seconds: wait so no QA session sees the old data
await new Promise((r) => setTimeout(r, 12_000));
