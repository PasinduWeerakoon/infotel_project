/**
 * QuickLook mock in AWS, for test environments only (never the live event): one Lambda with a
 * public Function URL. Printed QR codes open its /scan/{logoId} links.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface MockStackProps extends StackProps {
  /** Settings passed straight to the mock (secrets are test values for this environment only) */
  environment: Record<string, string>;
}

export class MockStack extends Stack {
  constructor(scope: Construct, id: string, props: MockStackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, 'QuickLookMock', {
      entry: path.join(here, '..', 'src', 'lambda.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: props.environment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: { minify: true, target: 'node22' },
    });
    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    new CfnOutput(this, 'MockUrl', { value: url.url });
  }
}
