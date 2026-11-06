/**
 * Counts the scans of a session that were kept as `unknown-logo` before every logo counted (the
 * logo list was dropped on 4 Nov 2026), with the same counting code as a live scan, in the order
 * they were received. Then works the winners out again if the session already has them.
 * Dry run first, then --apply:
 *
 *   TABLE_NAME=lkdr-dev-treasure-hunt AWS_PROFILE=1bt-training AWS_REGION=ap-south-1 \
 *     npx tsx scripts/recount-scans.ts <sessionId> [--apply]
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../src/data/db.js';
import { getSession } from '../src/data/hunt-repo.js';
import { recordLogoScan } from '../src/data/players-repo.js';
import { listScans } from '../src/data/scans-repo.js';
import { keys } from '../src/data/keys.js';
import { recalculateWinners } from '../src/services/winners-service.js';

const [sessionId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!sessionId) throw new Error('Give the session ID');
const session = await getSession(sessionId);
if (!session) throw new Error(`Session ${sessionId} not found`);

const scans = (await listScans(sessionId, undefined, 10_000))
  .filter((s) => s.result === 'unknown-logo')
  .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
console.log(`${session.name}: ${scans.length} scan(s) to count${apply ? '' : ' (dry run)'}`);

for (const scan of scans) {
  if (!apply) {
    console.log(`  ${scan.receivedAt} ${scan.userName} ${scan.logoId}`);
    continue;
  }
  const result = await recordLogoScan({
    sessionId,
    pointsPerStall: session.pointsPerStall,
    userId: scan.userId,
    userName: scan.userName,
    logoId: scan.logoId,
    at: scan.scannedAt,
  });
  await db.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: keys.scans(sessionId, ''), SK: scan.scanKey },
      UpdateExpression: 'SET #result = :result, recountedAt = :now',
      ExpressionAttributeNames: { '#result': 'result' },
      ExpressionAttributeValues: { ':result': result, ':now': new Date().toISOString() },
    }),
  );
  console.log(`  ${scan.receivedAt} ${scan.userName} ${scan.logoId}: ${result}`);
}
if (apply && scans.length && session.finalized) {
  const winners = await recalculateWinners(session);
  console.log(`Winners worked out again: ${winners.map((w) => `#${w.rank} ${w.fullName} (${w.stalls})`).join(', ')}`);
}
