/**
 * Creates the `treasure-hunt` table in DynamoDB Local and adds demo data:
 * two sessions a day. QuickLook sends scans of the hunt logos only, so there is no logo list.
 *
 *   npm run db:setup   (after the platform API's db:setup)
 */
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { atColomboTime, colomboDate, nowIso } from '../src/lib/time.js';

const TABLE = process.env.TABLE_NAME ?? 'lkdr-treasure-hunt';
// DynamoDB Local when DYNAMODB_ENDPOINT is set (npm run db:setup), otherwise the AWS account of the
// current profile, where CDK already created the table (npm run db:seed-aws)
const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT;
const client = LOCAL_ENDPOINT
  ? new DynamoDBClient({
      endpoint: LOCAL_ENDPOINT,
      region: 'local',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
  : new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

async function createTable() {
  const gsi = (name: string) => ({
    IndexName: name,
    KeySchema: [
      { AttributeName: `${name}PK`, KeyType: 'HASH' as const },
      { AttributeName: `${name}SK`, KeyType: 'RANGE' as const },
    ],
    Projection: { ProjectionType: 'ALL' as const },
  });
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'].map((name) => ({
          AttributeName: name,
          AttributeType: 'S' as const,
        })),
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [gsi('GSI1'), gsi('GSI2')],
      }),
    );
    console.log(`Created table ${TABLE}`);
  } catch (error) {
    if (error instanceof ResourceInUseException) console.log(`Table ${TABLE} already exists`);
    else throw error;
  }
}

async function seed() {
  const now = nowIso();
  // Today and the next days (SEED_DAYS, default 2)
  const days = Array.from({ length: Number(process.env.SEED_DAYS ?? 2) }, (_, i) =>
    colomboDate(new Date(Date.now() + i * 86_400_000)),
  );
  for (const date of days) {
    for (const [index, slot] of [
      ['00:00', '12:00'],
      ['12:00', '23:59'],
    ].entries()) {
      const sessionId = `hunt_${date.replaceAll('-', '')}_${index + 1}`;
      const startsAt = atColomboTime(date, slot[0] as string);
      await db.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `SESSION#${sessionId}`,
            SK: 'META',
            GSI1PK: 'SESSIONS',
            GSI1SK: startsAt,
            GSI2PK: `DATE#${date}`,
            GSI2SK: startsAt,
            sessionId,
            name: `Hunt ${index + 1}`,
            date,
            startsAt,
            endsAt: atColomboTime(date, slot[1] as string),
            override: null,
            pointsPerStall: 10,
            winnersCount: 3,
            prizes: [
              { rank: 1, prizeName: 'Headset' },
              { rank: 2, prizeName: 'Power bank' },
              { rank: 3, prizeName: 'Umbrella' },
            ],
            allowPreviousWinners: true,
            finalized: false,
            createdAt: now,
          },
        }),
      );
    }
  }
  console.log(`Seeded ${days.length * 2} hunt sessions`);
}

if (LOCAL_ENDPOINT) await createTable();
await seed();
