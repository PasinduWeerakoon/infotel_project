/**
 * AWS resources of the shared platform:
 * - HTTP API (shared: the Games and Treasure Hunt stacks add their own routes to it)
 * - `platform` table, EventBridge bus, assets bucket with CloudFront
 * - Lambdas: platform-auth, platform-scan-intake, platform-admin
 *
 * Other stacks find the shared resources through SSM parameters under /lkdr/{stage}/platform/.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface PlatformStackProps extends StackProps {
  stage: 'dev' | 'prod';
  gamesWebUrl: string;
  huntWebUrl: string;
  quickLook: { issuer: string; apiBase: string; clientId: string };
  /** mock: QuickLook redirect tokens become stored test users (testing). quicklook: real token exchange */
  tokenMode: 'mock' | 'quicklook';
  /** Warm Lambdas for event days (0 outside the event) */
  provisionedConcurrency: number;
}

export class PlatformStack extends Stack {
  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const ssmPrefix = `/lkdr/${stage}`;
    const isProd = stage === 'prod';

    const table = new dynamodb.TableV2(this, 'PlatformTable', {
      tableName: `lkdr-${stage}-platform`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const bus = new events.EventBus(this, 'GamesBus', { eventBusName: `lkdr-${stage}-games` });

    // Uploaded logos and prize images: private bucket, served through CloudFront
    const assets = new s3.Bucket(this, 'Assets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: ['*'], allowedHeaders: ['*'] }],
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });
    const assetsCdn = new cloudfront.Distribution(this, 'AssetsCdn', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(assets),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });
    const assetsBaseUrl = `https://${assetsCdn.distributionDomainName}`;

    const httpApi = new apigw.HttpApi(this, 'HttpApi', { apiName: `lkdr-${stage}-api` });
    // Throttling protects the account. Limits are well above the 1,000 requests per second target.
    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigw.CfnStage;
    defaultStage.defaultRouteSettings = { throttlingRateLimit: 3000, throttlingBurstLimit: 2000 };

    const environment: Record<string, string> = {
      STAGE: stage,
      SERVICE_NAME: 'platform-api',
      TABLE_NAME: table.tableName,
      COOKIE_SECURE: 'true',
      QL_ISSUER: props.quickLook.issuer,
      QL_API_BASE: props.quickLook.apiBase,
      QL_CLIENT_ID: props.quickLook.clientId,
      GAMES_WEB_URL: props.gamesWebUrl,
      HUNT_WEB_URL: props.huntWebUrl,
      QL_TOKEN_MODE: props.tokenMode,
      EVENTS_MODE: 'eventbridge',
      EVENT_BUS_NAME: bus.eventBusName,
      ASSETS_MODE: 's3',
      ASSETS_BUCKET: assets.bucketName,
      ASSETS_BASE_URL: assetsBaseUrl,
      SECRETS_SOURCE: 'ssm',
      SSM_PREFIX: ssmPrefix,
    };

    const readSecrets = new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/*`],
    });

    const makeFunction = (name: string, entry: string, warm: boolean) => {
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
      fn.addToRolePolicy(readSecrets);
      table.grantReadWriteData(fn);
      const alias = new lambda.Alias(this, `${name}-live`, {
        aliasName: 'live',
        version: fn.currentVersion,
        provisionedConcurrentExecutions:
          warm && props.provisionedConcurrency > 0 ? props.provisionedConcurrency : undefined,
      });
      return { fn, alias };
    };

    const auth = makeFunction('platform-auth', 'auth.ts', true);
    const scanIntake = makeFunction('platform-scan-intake', 'scan-intake.ts', true);
    const admin = makeFunction('platform-admin', 'admin.ts', false);
    bus.grantPutEventsTo(scanIntake.fn);
    bus.grantPutEventsTo(auth.fn); // scan by redirect (POST /auth/v1/scan-login) publishes scans too
    assets.grantPut(admin.fn);

    const route = (paths: string[], method: apigw.HttpMethod, target: lambda.Alias, name: string) => {
      httpApi.addRoutes({
        path: paths[0] ?? '/',
        methods: [method],
        integration: new HttpLambdaIntegration(name, target),
      });
      for (const extra of paths.slice(1)) {
        httpApi.addRoutes({
          path: extra,
          methods: [method],
          integration: new HttpLambdaIntegration(`${name}-${extra}`, target),
        });
      }
    };
    route(['/auth/v1/{proxy+}'], apigw.HttpMethod.ANY, auth.alias, 'AuthRoutes');
    route(['/integrations/quicklook/v1/scan-events'], apigw.HttpMethod.POST, scanIntake.alias, 'ScanRoutes');
    route(
      [
        '/admin/v1/auth/{proxy+}',
        '/admin/v1/users',
        '/admin/v1/users/{proxy+}',
        '/admin/v1/logos',
        '/admin/v1/logos/{proxy+}',
        '/admin/v1/uploads',
        '/admin/v1/quicklook/{proxy+}',
        '/platform/v1/logos',
      ],
      apigw.HttpMethod.ANY,
      admin.alias,
      'AdminRoutes',
    );

    // Shared values for the other stacks and the web apps
    const shared: Record<string, string> = {
      'http-api-id': httpApi.apiId,
      'http-api-url': httpApi.apiEndpoint,
      'table-name': table.tableName,
      'table-arn': table.tableArn,
      'event-bus-name': bus.eventBusName,
      'event-bus-arn': bus.eventBusArn,
      'assets-base-url': assetsBaseUrl,
    };
    for (const [name, value] of Object.entries(shared)) {
      new ssm.StringParameter(this, `Shared-${name}`, {
        parameterName: `${ssmPrefix}/platform/${name}`,
        stringValue: value,
      });
    }

    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'AssetsUrl', { value: assetsBaseUrl });
  }
}
