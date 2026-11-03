/**
 * Creates the `treasure-hunt` table in DynamoDB Local and adds demo data:
 * two sessions today and two tomorrow (locally with the QuickLook mock's eight hunt logos selected).
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

/**
 * The eight Treasure Hunt logos of the QuickLook mock (backend/quicklook-mock/src/leaderboard.ts),
 * selected on every local session. In AWS sessions start with no logos: the admin selects the
 * real QuickLook logos in the dashboard.
 */
const MOCK_EVENT_LOGOS = [
  ['1', 'Lanka Fibre Broadband', 'Lanka Fibre', 'QL-0101'],
  ['2', 'CeyCloud Hosting', 'CeyCloud', 'QL-0102'],
  ['3', 'Serendib Payments', 'Serendib Pay', 'QL-0103'],
  ['4', 'Kandy Code Academy', null, 'QL-0104'],
  ['5', 'Ruhuna Robotics', 'Ruhuna Robotics', 'QL-0105'],
  ['6', 'Lotus Mobile', 'Lotus Telecom', 'QL-0106'],
  ['7', 'Galle Data Labs', 'Galle Data', 'QL-0107'],
  ['8', 'Island Domains', 'LK Domain Registry', 'QL-0108'],
].map(([n, productName, companyName, logoCode]) => ({
  logoId: `0b6f2a10-1c1e-4a61-9a01-00000000000${n}`,
  productName,
  companyName,
  logoCode,
  logoUrl: null,
}));

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
            allowPreviousWinners: false,
            logos: LOCAL_ENDPOINT ? MOCK_EVENT_LOGOS : [],
            finalized: false,
            createdAt: now,
          },
        }),
      );
    }
  }
  console.log(
    `Seeded ${days.length * 2} hunt sessions${LOCAL_ENDPOINT ? ' with the mock QuickLook logos' : ''}`,
  );
}

if (LOCAL_ENDPOINT) await createTable();
await seed();
