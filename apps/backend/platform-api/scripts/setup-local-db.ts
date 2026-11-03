/**
 * Creates the `platform` table in DynamoDB Local and adds starter data:
 * a super admin and the two game logos plus two display logos.
 *
 *   docker compose up -d   (in apps/backend)
 *   npm run db:setup
 */
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '../src/domain/password.js';
import { nowIso } from '../src/lib/time.js';

const TABLE = process.env.TABLE_NAME ?? 'lkdr-platform';
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
const db = DynamoDBDocumentClient.from(client);

async function createTable() {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
    console.log(`Created table ${TABLE}`);
  } catch (error) {
    if (error instanceof ResourceInUseException) console.log(`Table ${TABLE} already exists`);
    else throw error;
  }
}

async function seed() {
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'ChangeMe2026';
  await db
    .send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: 'ADMIN',
          SK: 'USER#super.admin',
          username: 'super.admin',
          role: 'super-admin',
          passwordHash: await hashPassword(password),
          disabled: false,
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: nowIso(),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    )
    .catch(() => console.log('Admin super.admin already exists'));

  const logos = [
    { logoId: 'logo_game_spin', name: 'Spin the Wheel', logoType: 'game', targetId: 'spin' },
    { logoId: 'logo_game_dip', name: 'Lucky Dip', logoType: 'game', targetId: 'lucky-dip' },
    { logoId: 'logo_event', name: 'Event logo', logoType: 'display', targetId: 'event' },
    { logoId: 'logo_hunt', name: 'Treasure Hunt', logoType: 'display', targetId: 'hunt' },
  ];
  for (const logo of logos) {
    await db
      .send(
        new PutCommand({
          TableName: TABLE,
          Item: { PK: 'LOGO', SK: `LOGO#${logo.logoId}`, ...logo, imageKey: null, updatedAt: nowIso() },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      .catch(() => undefined);
  }
  console.log(
    `Seeded admin "super.admin" (password from BOOTSTRAP_ADMIN_PASSWORD) and ${logos.length} logos`,
  );
}

if (LOCAL_ENDPOINT) await createTable();
await seed();
