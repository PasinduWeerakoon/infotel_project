/**
 * CDK app for the Games Event API. Deploy the platform stack first (it owns the shared HTTP API).
 *
 *   npx cdk deploy -c stage=dev
 *   npx cdk deploy -c stage=prod -c provisioned=20   (event days)
 */
import { App } from 'aws-cdk-lib';
import { GamesStack } from './games-stack.js';

const app = new App();
const stage = (app.node.tryGetContext('stage') ?? 'dev') as 'dev' | 'prod';

new GamesStack(app, `lkdr-${stage}-games-event`, {
  stage,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  provisionedConcurrency: Number(app.node.tryGetContext('provisioned') ?? 0),
  tags: { project: 'lkdr-games', stage },
});
