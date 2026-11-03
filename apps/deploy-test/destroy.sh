#!/usr/bin/env bash
# Removes the whole test environment (stage "dev") from the AWS account. Tables, buckets and
# logs of the dev stage are deleted with it. The CDK bootstrap stack and SSM secrets are kept.
#
#   AWS_PROFILE=default EXPECTED_ACCOUNT=123456789012 npm run destroy
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APPS="$(cd "$HERE/.." && pwd)"
STAGE=dev
export AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_REGION=ap-south-1 AWS_DEFAULT_REGION=ap-south-1 CDK_DEFAULT_REGION=ap-south-1
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
export CDK_DEFAULT_ACCOUNT=$ACCOUNT
if [ -n "${EXPECTED_ACCOUNT:-}" ] && [ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "Stopped: profile $AWS_PROFILE is account $ACCOUNT, expected $EXPECTED_ACCOUNT" >&2
  exit 1
fi

destroy() { (cd "$1" && shift && npx cdk destroy --force -c stage=$STAGE "$@"); }
destroy "$APPS/frontend/web-infra" --all
destroy "$APPS/backend/quicklook-mock"
destroy "$APPS/backend/treasure-hunt-api"
destroy "$APPS/backend/games-event-api"
destroy "$APPS/backend/platform-api"
echo "Test environment removed from account $ACCOUNT."
