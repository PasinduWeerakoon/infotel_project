#!/usr/bin/env bash
# Starts the test environment from the beginning without redeploying: deletes all data (players,
# plays, sessions, prizes, hunt progress, logos, uploaded images), then loads fresh demo data,
# the default logo artwork and a new QR sheet. Stacks, addresses, secrets and screen keys stay.
#
#   AWS_PROFILE=default EXPECTED_ACCOUNT=123456789012 npm run reset
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APPS="$(cd "$HERE/.." && pwd)"
STAGE=dev
export AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_REGION=ap-south-1 AWS_DEFAULT_REGION=ap-south-1
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [ -n "${EXPECTED_ACCOUNT:-}" ] && [ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "Stopped: profile $AWS_PROFILE is account $ACCOUNT, expected $EXPECTED_ACCOUNT" >&2
  exit 1
fi
set -a; export STATE_DIR="${STATE_DIR:-.state}"
source "$HERE/$STATE_DIR/secrets.env"; set +a

step() { printf '\n=== %s\n' "$1"; }

step "1/4 Delete all data in account $ACCOUNT ($STAGE)"
(cd "$HERE" && STAGE=$STAGE npx tsx clear-data.ts)

step "2/4 Fresh demo data"
(cd "$APPS/backend/platform-api" && TABLE_NAME=lkdr-$STAGE-platform BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run -s db:seed-aws)
(cd "$APPS/backend/games-event-api" && TABLE_NAME=lkdr-$STAGE-games-event SEED_DAYS=5 ASSETS_BASE_URL=unused \
  SCREEN_KEY_SPIN="$SCREEN_KEY_SPIN" SCREEN_KEY_DIP="$SCREEN_KEY_DIP" SCREEN_KEY_MAIN="$SCREEN_KEY_MAIN" npm run -s db:seed-aws)
(cd "$APPS/backend/treasure-hunt-api" && TABLE_NAME=lkdr-$STAGE-treasure-hunt PLATFORM_TABLE_NAME=lkdr-$STAGE-platform \
  SEED_DAYS=5 npm run -s db:seed-aws)

step "3/4 Default logo artwork"
(cd "$HERE" && npx tsx upload-logos.ts)

step "4/4 QR sheet"
(cd "$HERE" && npx tsx make-qr.ts)

echo
echo "Done. Every phone can play again: old plays are gone, and each phone keeps its test player name."
