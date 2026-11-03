/**
 * AWS resources of Project A (LKDR Games Event):
 * - `games-event` table
 * - Lambdas: games-visitor, games-admin, games-screen (WebSocket), games-jobs (every minute)
 * - WebSocket API for stall screens
 * - Routes on the shared HTTP API created by the platform stack
 *
 * Shared platform values are read from SSM (/lkdr/{stage}/platform/*), so this stack deploys on its own.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface GamesStackProps extends StackProps {
  stage: 'dev' | 'prod';
  provisionedConcurrency: number;
}

export class GamesStack extends Stack {
  constructor(scope: Construct, id: string, props: GamesStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const ssmPrefix = `/lkdr/${stage}`;
    const shared = (name: string) =>
      ssm.StringParameter.valueForStringParameter(this, `${ssmPrefix}/platform/${name}`);

    const table = new dynamodb.TableV2(this, 'GamesTable', {
      tableName: `lkdr-${stage}-games-event`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      globalSecondaryIndexes: ['GSI1', 'GSI2'].map((name) => ({
        indexName: name,
        partitionKey: { name: `${name}PK`, type: dynamodb.AttributeType.STRING },
        sortKey: { name: `${name}SK`, type: dynamodb.AttributeType.STRING },
      })),
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const platformTable = dynamodb.Table.fromTableArn(this, 'PlatformTable', shared('table-arn'));
    const webSocketApi = new apigw.WebSocketApi(this, 'ScreensApi', { apiName: `lkdr-${stage}-screens` });
    const webSocketStage = new apigw.WebSocketStage(this, 'ScreensStage', {
      webSocketApi,
      stageName: 'live',
      autoDeploy: true,
    });

    const environment: Record<string, string> = {
      STAGE: stage,
      SERVICE_NAME: 'games-event-api',
      TABLE_NAME: table.tableName,
      PLATFORM_TABLE_NAME: shared('table-name'),
      ASSETS_BASE_URL: shared('assets-base-url'),
      SCREENS_MODE: 'apigateway',
      WS_CALLBACK_URL: webSocketStage.callbackUrl,
      SECRETS_SOURCE: 'ssm',
      SSM_PREFIX: ssmPrefix,
    };

    const makeFunction = (name: string, entry: string, warm = false) => {
      const fn = new NodejsFunction(this, name, {
        functionName: `lkdr-${stage}-${name}`,
        entry: path.join(here, '..', 'src', 'handlers', entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(10),
        environment,
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: { minify: true, sourceMap: true, target: 'node22' },
      });
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/platform/*`],
        }),
      );
      table.grantReadWriteData(fn);
      platformTable.grantReadWriteData(fn); // read scans, mark them used
      webSocketStage.grantManagementApiAccess(fn);
      const alias = new lambda.Alias(this, `${name}-live`, {
        aliasName: 'live',
        version: fn.currentVersion,
        provisionedConcurrentExecutions:
          warm && props.provisionedConcurrency > 0 ? props.provisionedConcurrency : undefined,
      });
      return alias;
    };

    const visitor = makeFunction('games-visitor', 'visitor.ts', true);
    const admin = makeFunction('games-admin', 'admin.ts');
    const screen = makeFunction('games-screen', 'screen.ts');
    const jobs = makeFunction('games-jobs', 'jobs.ts');

    // Stall screen WebSocket routes ($connect, $disconnect, and every message on $default)
    for (const routeKey of ['$connect', '$disconnect', '$default']) {
      new apigw.WebSocketRoute(this, `Screens${routeKey.slice(1)}`, {
        webSocketApi,
        routeKey,
        integration: new WebSocketLambdaIntegration(`Screens${routeKey.slice(1)}Integration`, screen),
      });
    }

    // Expire unplayed entries and roll over prizes every minute
    new events.Rule(this, 'JobsEveryMinute', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(jobs)],
    });

    // Routes on the shared HTTP API
    const httpApi = apigw.HttpApi.fromHttpApiAttributes(this, 'SharedHttpApi', {
      httpApiId: shared('http-api-id'),
    });
    const addRoute = (id: string, routePath: string, target: lambda.IFunction) =>
      new apigw.HttpRoute(this, id, {
        httpApi,
        routeKey: apigw.HttpRouteKey.with(routePath, apigw.HttpMethod.ANY),
        integration: new HttpLambdaIntegration(`${id}Integration`, target),
      });
    addRoute('VisitorRoutes', '/games/v1/{proxy+}', visitor);
    addRoute('AdminRoutes', '/admin/v1/games/{proxy+}', admin);

    new ssm.StringParameter(this, 'ScreensUrl', {
      parameterName: `${ssmPrefix}/games/screens-ws-url`,
      stringValue: webSocketStage.url,
    });
    new CfnOutput(this, 'ScreensWebSocketUrl', { value: webSocketStage.url });
  }
}
