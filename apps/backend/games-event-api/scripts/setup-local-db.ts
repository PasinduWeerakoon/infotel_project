/**
 * Creates the `games-event` table in DynamoDB Local and adds demo data so the apps work at any time:
 * five prizes, two sessions today and two tomorrow (both games), allocations, two stall screens and a main display.
 *
 *   npm run db:setup
 *
 * Local screen keys (never use outside your machine):
 *   Spin the Wheel screen: scr_local_spin
 *   Lucky Dip screen:      scr_local_dip
 *   Main display (both games, opened from the games web address in test builds): scr_local_main
 */
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashKey } from '../src/data/screens-repo.js';
import { splitByWeights } from '../src/domain/allocation.js';
import { atColomboTime, colomboDate, nowIso } from '../src/lib/time.js';

const TABLE = process.env.TABLE_NAME ?? 'lkdr-games-event';
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
const put = (Item: Record<string, unknown>) => db.send(new PutCommand({ TableName: TABLE, Item }));

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

const PRIZES = [
  { prizeId: 'pen-drive', name: 'Pen drive 32 GB', stock: 40, isMainPrize: true },
  { prizeId: 'umbrella', name: 'Umbrella', stock: 20, isMainPrize: true },
  { prizeId: 'headset', name: 'Headset', stock: 8, isMainPrize: true },
  { prizeId: 'mug', name: 'Mug', stock: 60, isMainPrize: false },
  { prizeId: 'chocolate', name: 'Chocolate', stock: 200, isMainPrize: false },
];

async function seed() {
  const now = nowIso();
  for (const prize of PRIZES) {
    await put({ PK: 'PRIZE', SK: `PRIZE#${prize.prizeId}`, ...prize, imageKey: null, createdAt: now });
  }

  // Today and the next days (SEED_DAYS, default 2)
  const days = Array.from({ length: Number(process.env.SEED_DAYS ?? 2) }, (_, i) =>
    colomboDate(new Date(Date.now() + i * 86_400_000)),
  );
  const sessions = days.flatMap((date) => [
    { date, name: 'Session 1', start: '00:00', end: '12:00' },
    { date, name: 'Session 2', start: '12:00', end: '23:59' },
  ]);
  const sessionIds = sessions.map((s, i) => `ses_${s.date.replaceAll('-', '')}_${i % 2 === 0 ? 1 : 2}`);

  for (const [i, s] of sessions.entries()) {
    const startsAt = atColomboTime(s.date, s.start);
    await put({
      PK: `SESSION#${sessionIds[i]}`,
      SK: 'META',
      GSI1PK: 'SESSIONS',
      GSI1SK: startsAt,
      GSI2PK: `DATE#${s.date}`,
      GSI2SK: startsAt,
      sessionId: sessionIds[i],
      name: s.name,
      date: s.date,
      startsAt,
      endsAt: atColomboTime(s.date, s.end),
      games: ['spin', 'lucky-dip'],
      override: null,
      rolledOver: false,
      createdAt: now,
    });
  }

  // Each prize's stock is split equally across the 4 sessions and the 2 games
  const cells = sessionIds.flatMap((sessionId) =>
    ['spin', 'lucky-dip'].map((game) => `${sessionId}|${game}`),
  );
  for (const prize of PRIZES) {
    const split = splitByWeights(prize.stock, Object.fromEntries(cells.map((c) => [c, 1])));
    for (const [cell, allocated] of Object.entries(split)) {
      const [sessionId, game] = cell.split('|') as [string, string];
      await put({
        PK: `SESSION#${sessionId}`,
        SK: `ALLOC#${game}#${prize.prizeId}`,
        GSI1PK: 'ALLOC',
        GSI1SK: `${prize.prizeId}#${sessionId}#${game}`,
        sessionId,
        game,
        prizeId: prize.prizeId,
        allocated,
        remaining: allocated,
        given: 0,
      });
    }
  }

  const screens = [
    {
      screenId: 'scr_spin',
      name: 'Spin the Wheel stall',
      games: ['spin'],
      key: process.env.SCREEN_KEY_SPIN ?? 'scr_local_spin',
    },
    {
      screenId: 'scr_dip',
      name: 'Lucky Dip stall',
      games: ['lucky-dip'],
      key: process.env.SCREEN_KEY_DIP ?? 'scr_local_dip',
    },
    {
      screenId: 'scr_main',
      name: 'Main display',
      games: ['spin', 'lucky-dip'],
      key: process.env.SCREEN_KEY_MAIN ?? 'scr_local_main',
    },
  ];
  for (const screen of screens) {
    const keyHash = hashKey(screen.key);
    await put({
      PK: 'SCREEN',
      SK: `SCREEN#${screen.screenId}`,
      screenId: screen.screenId,
      name: screen.name,
      games: screen.games,
      keyHash,
      lastSeenAt: null,
      createdAt: now,
    });
    await put({ PK: `SCREENKEY#${keyHash}`, SK: 'META', screenId: screen.screenId });
  }
  console.log(
    `Seeded ${PRIZES.length} prizes, ${sessions.length} sessions, 2 stall screens and a main display`,
  );
}

if (LOCAL_ENDPOINT) await createTable();
await seed();
