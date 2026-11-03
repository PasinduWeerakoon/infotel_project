/**
 * CDK app for the platform API.
 *
 *   npx cdk deploy -c stage=dev
 *   npx cdk deploy -c stage=prod -c provisioned=20   (event days)
 *
 * Secrets are created once by hand in SSM Parameter Store (SecureString), see README.
 */
import { App } from 'aws-cdk-lib';
import { PlatformStack } from './platform-stack.js';

const app = new App();
const stage = (app.node.tryGetContext('stage') ?? 'dev') as 'dev' | 'prod';
const domain = app.node.tryGetContext('domain') ?? 'example.lk';

new PlatformStack(app, `lkdr-${stage}-platform`, {
  stage,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  gamesWebUrl: app.node.tryGetContext('gamesWebUrl') ?? `https://games.${domain}`,
  huntWebUrl: app.node.tryGetContext('huntWebUrl') ?? `https://hunt.${domain}`,
  quickLook: {
    issuer: app.node.tryGetContext('qlIssuer') ?? 'https://login.quicklook.example',
    apiBase: app.node.tryGetContext('qlApiBase') ?? 'https://api.quicklook.example',
    clientId: app.node.tryGetContext('qlClientId') ?? 'lkdr',
  },
  tokenMode: app.node.tryGetContext('tokenMode') === 'quicklook' ? 'quicklook' : 'mock',
  provisionedConcurrency: Number(app.node.tryGetContext('provisioned') ?? 0),
  tags: { project: 'lkdr-games', stage },
});
