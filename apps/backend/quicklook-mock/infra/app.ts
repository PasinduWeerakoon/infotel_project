/**
 * CDK app for the QuickLook mock (test environments only).
 *   npx cdk deploy -c stage=dev -c platformUrl=... -c gamesWebUrl=... (see apps/deploy-test)
 */
import { App } from 'aws-cdk-lib';
import { MockStack } from './mock-stack.js';

const app = new App();
const stage = (app.node.tryGetContext('stage') ?? 'dev') as string;
const ctx = (name: string, fallback = '') =>
  String(app.node.tryGetContext(name) ?? process.env[name] ?? fallback);

new MockStack(app, `lkdr-${stage}-quicklook-mock`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  tags: { project: 'lkdr-games', stage, purpose: 'test-only' },
  environment: {
    QL_CLIENT_ID: ctx('qlClientId', 'lkdr'),
    QL_CLIENT_SECRET: ctx('MOCK_CLIENT_SECRET'),
    QL_WEBHOOK_SECRET: ctx('MOCK_WEBHOOK_SECRET'),
    MOCK_SIGNING_JWK: ctx('MOCK_SIGNING_JWK'),
    PLATFORM_URL: ctx('platformUrl'),
    GAMES_WEB_URL: ctx('gamesWebUrl', 'https://example.invalid'),
    HUNT_WEB_URL: ctx('huntWebUrl', 'https://example.invalid'),
    ADMIN_WEB_URL: ctx('adminWebUrl', 'https://example.invalid'),
    SCREEN_WEB_URL: ctx('screenWebUrl', 'https://example.invalid'),
  },
});
