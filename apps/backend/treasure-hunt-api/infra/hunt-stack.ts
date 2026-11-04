/**
 * AWS resources of Project B (Treasure Hunt):
 * - `treasure-hunt` table
 * - Lambdas: hunt-visitor, hunt-admin, hunt-scans (QuickLook's backend sends every stall scan,
 *   encrypted), hunt-jobs (every minute: freezes ended sessions and works out the winners)
 * - Routes on the shared HTTP API created by the platform stack
 * The scan key and the QuickLook API address and key are read at runtime from SSM ({prefix}/hunt/*).
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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

export interface HuntStackProps extends StackProps {
  stage: 'dev' | 'prod';
  provisionedConcurrency: number;
}

export class HuntStack extends Stack {
  constructor(scope: Construct, id: string, props: HuntStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const ssmPrefix = `/lkdr/${stage}`;
    // Event data must survive a stack delete (prod, or the event running on the dev stacks)
    const keepData = stage === 'prod' || this.node.tryGetContext('keepData') === 'true';
    const shared = (name: string) =>
      ssm.StringParameter.valueForStringParameter(this, `${ssmPrefix}/platform/${name}`);

    const table = new dynamodb.TableV2(this, 'HuntTable', {
      tableName: `lkdr-${stage}-treasure-hunt`,
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
      removalPolicy: keepData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      deletionProtection: keepData,
    });
    const platformTable = dynamodb.Table.fromTableArn(this, 'PlatformTable', shared('table-arn'));

    const environment: Record<string, string> = {
      STAGE: stage,
      SERVICE_NAME: 'treasure-hunt-api',
      TABLE_NAME: table.tableName,
      PLATFORM_TABLE_NAME: shared('table-name'),
      SECRETS_SOURCE: 'ssm',
      SSM_PREFIX: ssmPrefix,
    };

    const makeFunction = (name: string, entry: string, warm = false, timeoutSeconds = 10) => {
      const fn = new NodejsFunction(this, name, {
        functionName: `lkdr-${stage}-${name}`,
        entry: path.join(here, '..', 'src', 'handlers', entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(timeoutSeconds),
        environment,
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: { minify: true, sourceMap: true, target: 'node22' },
      });
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/platform/*`,
            `arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/hunt/*`,
          ],
        }),
      );
      table.grantReadWriteData(fn);
      platformTable.grantReadData(fn);
      return new lambda.Alias(this, `${name}-live`, {
        aliasName: 'live',
        version: fn.currentVersion,
        provisionedConcurrentExecutions:
          warm && props.provisionedConcurrency > 0 ? props.provisionedConcurrency : undefined,
      });
    };

    const visitor = makeFunction('hunt-visitor', 'visitor.ts', true);
    const admin = makeFunction('hunt-admin', 'admin.ts');
    // QuickLook calls this for every stall scan, so it is kept warm like the visitor API
    const scans = makeFunction('hunt-scans', 'integration.ts', true);
    const jobs = makeFunction('hunt-jobs', 'jobs.ts', false, 30);

    new events.Rule(this, 'JobsEveryMinute', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(jobs)],
    });

    const httpApi = apigw.HttpApi.fromHttpApiAttributes(this, 'SharedHttpApi', {
      httpApiId: shared('http-api-id'),
    });
    const addRoute = (routeId: string, routePath: string, target: lambda.IFunction) =>
      new apigw.HttpRoute(this, routeId, {
        httpApi,
        routeKey: apigw.HttpRouteKey.with(routePath, apigw.HttpMethod.ANY),
        integration: new HttpLambdaIntegration(`${routeId}Integration`, target),
      });
    addRoute('VisitorRoutes', '/hunt/v1/{proxy+}', visitor);
    addRoute('AdminRoutes', '/admin/v1/hunt/{proxy+}', admin);
    new apigw.HttpRoute(this, 'ScanRoutes', {
      httpApi,
      routeKey: apigw.HttpRouteKey.with('/integrations/quicklook/v1/hunt-scans', apigw.HttpMethod.POST),
      integration: new HttpLambdaIntegration('ScanRoutesIntegration', scans),
    });
  }
}
