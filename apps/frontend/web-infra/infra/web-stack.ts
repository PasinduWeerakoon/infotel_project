/**
 * Hosting for one web app:
 * - private S3 bucket with the built files, served by CloudFront (Shield Standard included)
 * - API paths of that app (/auth, /games, /hunt, /admin, /platform) forwarded to the shared HTTP API,
 *   so pages and APIs share one origin: the sign-in cookie just works and no CORS is needed
 * - security headers, HTTPS only, long caching for hashed assets, no caching for index.html
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface WebAppConfig {
  /** Folder name under apps/frontend, for example `games-web` */
  app: string;
  /** API path patterns this app calls, forwarded to the HTTP API */
  apiPaths: string[];
  /** API responses that may be cached briefly, following the API's own Cache-Control header */
  cacheablePaths?: string[];
}

export interface WebStackProps extends StackProps {
  stage: 'dev' | 'prod';
  config: WebAppConfig;
  /** Optional custom domain, for example games.example.lk (certificate must be in us-east-1) */
  domainName?: string;
  certificateArn?: string;
}

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { stage, config } = props;

    const bucket = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: stage !== 'prod',
    });

    // The API host comes from the platform stack (SSM), for example abc123.execute-api.ap-south-1.amazonaws.com
    const apiUrl = ssm.StringParameter.valueForStringParameter(this, `/lkdr/${stage}/platform/http-api-url`);
    const apiOrigin = new origins.HttpOrigin(Fn.select(2, Fn.split('/', apiUrl)), {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'none'",
          override: true,
        },
      },
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(here, '..', 'functions', 'spa-rewrite.js'),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const apiBehavior = (cachePolicy: cloudfront.ICachePolicy): cloudfront.BehaviorOptions => ({
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy,
      // Forward cookies, query strings and headers (except Host, which API Gateway needs as its own)
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: securityHeaders,
    });

    // Follows the API's Cache-Control header. The cache key holds query strings only: the managed
    // "UseOriginCacheControlHeaders" policies add the Host header, which makes API Gateway answer 403
    const apiCache = new cloudfront.CachePolicy(this, 'ApiCache', {
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.minutes(5),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};
    for (const pattern of config.cacheablePaths ?? []) {
      additionalBehaviors[pattern] = apiBehavior(apiCache);
    }
    for (const pattern of config.apiPaths) {
      additionalBehaviors[pattern] = apiBehavior(cloudfront.CachePolicy.CACHING_DISABLED);
    }

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `LKDR ${config.app} (${stage})`,
      defaultRootObject: 'index.html',
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
        compress: true,
      },
      additionalBehaviors,
    });

    const dist = path.join(here, '..', '..', config.app, 'dist');
    // Hashed files are cached for a year. index.html is never cached, so a release shows at once.
    new deploy.BucketDeployment(this, 'Assets', {
      sources: [deploy.Source.asset(dist, { exclude: ['index.html'] })],
      destinationBucket: bucket,
      cacheControl: [deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });
    new deploy.BucketDeployment(this, 'Index', {
      sources: [deploy.Source.asset(dist, { exclude: ['*', '!index.html'] })],
      destinationBucket: bucket,
      cacheControl: [deploy.CacheControl.fromString('no-cache')],
      prune: false,
      distribution,
      distributionPaths: ['/index.html'],
    });

    new CfnOutput(this, 'Url', {
      value: `https://${props.domainName ?? distribution.distributionDomainName}`,
    });
  }
}
