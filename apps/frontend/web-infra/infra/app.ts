/**
 * One stack per web app, so each can be released on its own:
 *
 *   npm run build              (in the app's folder first)
 *   npx cdk deploy lkdr-dev-web-games -c stage=dev
 *   npx cdk deploy lkdr-prod-web-admin -c stage=prod -c domain=example.lk -c certificateArn=arn:...
 *
 * Deploy the backend stacks first (the platform stack publishes the API address to SSM).
 */
import { App } from 'aws-cdk-lib';
import { type WebAppConfig, WebStack } from './web-stack.js';

const app = new App();
const stage = (app.node.tryGetContext('stage') ?? 'dev') as 'dev' | 'prod';
const domain: string | undefined = app.node.tryGetContext('domain');
const certificateArn: string | undefined = app.node.tryGetContext('certificateArn');

const APPS: Record<string, WebAppConfig & { subdomain: string }> = {
  games: {
    app: 'games-web',
    subdomain: 'games',
    apiPaths: ['/auth/*', '/games/*', '/platform/*'],
    cacheablePaths: ['/games/v1/status'],
  },
  hunt: {
    app: 'hunt-web',
    subdomain: 'hunt',
    apiPaths: ['/auth/*', '/hunt/*', '/platform/*'],
    cacheablePaths: ['/hunt/v1/status', '/hunt/v1/leaderboard'],
  },
  screens: {
    app: 'screen-web',
    subdomain: 'screens',
    apiPaths: ['/hunt/*', '/platform/*'],
    cacheablePaths: ['/hunt/v1/leaderboard', '/platform/v1/logos'],
  },
  admin: {
    app: 'admin-web',
    subdomain: 'admin',
    apiPaths: ['/admin/*', '/platform/*'],
  },
};

for (const [name, config] of Object.entries(APPS)) {
  new WebStack(app, `lkdr-${stage}-web-${name}`, {
    stage,
    config,
    domainName: domain ? `${config.subdomain}.${domain}` : undefined,
    certificateArn,
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
    crossRegionReferences: true,
    tags: { project: 'lkdr-games', stage },
  });
}
