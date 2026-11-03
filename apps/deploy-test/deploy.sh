#!/usr/bin/env bash
# Re-run without resetting the demo data: SKIP_SEED=1 npm run deploy
# Start the data from the beginning (no redeploy): npm run reset
# Deploys a complete TEST environment to your own AWS account (stage "dev", Mumbai), then loads
# demo data and prints QR codes for phone testing. Safe to run again: it updates what exists.
# QuickLook is not needed: QR codes open our apps directly and the platform turns each phone's
# token into a test user (QL_TOKEN_MODE=mock).
#
#   AWS_PROFILE=default EXPECTED_ACCOUNT=123456789012 npm run deploy
# A second account keeps its own secrets and addresses in its own folder:
#   AWS_PROFILE=1bt-training EXPECTED_ACCOUNT=550586832874 STATE_DIR=.state-1bt npm run deploy
# Connect the Treasure Hunt to QuickLook's Leaderboard API (once per environment, see below):
#   LEADERBOARD_BASE_URL=https://... LEADERBOARD_API_KEY=... npm run deploy
#
# Order matters because the pieces need each other's addresses:
#   platform -> games + hunt -> web apps -> platform again with the web app addresses
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APPS="$(cd "$HERE/.." && pwd)"
export STATE_DIR="${STATE_DIR:-.state}"
STATE="$HERE/$STATE_DIR"
STAGE=dev
REGION=ap-south-1

export AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_REGION=$REGION AWS_DEFAULT_REGION=$REGION CDK_DEFAULT_REGION=$REGION

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
export CDK_DEFAULT_ACCOUNT=$ACCOUNT
if [ -n "${EXPECTED_ACCOUNT:-}" ] && [ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "Stopped: profile $AWS_PROFILE is account $ACCOUNT, expected $EXPECTED_ACCOUNT" >&2
  exit 1
fi
echo "Deploying stage $STAGE to account $ACCOUNT in $REGION (profile $AWS_PROFILE)"

step() { printf '\n=== %s\n' "$1"; }
output() { aws cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
cdk_deploy() { (cd "$1" && shift && npx cdk deploy --require-approval never -c stage=$STAGE "$@"); }

# ---------------------------------------------------------------- secrets (created once, kept in .state)
step "Secrets"
mkdir -p "$STATE"
if [ ! -f "$STATE/secrets.env" ]; then
  rand() { node -e "console.log(require('crypto').randomBytes($1).toString('base64url'))"; }
  {
    echo "SESSION_SECRET=$(rand 32)"
    echo "ADMIN_SECRET=$(rand 32)"
    echo "QL_CLIENT_SECRET=$(rand 24)"
    echo "QL_WEBHOOK_SECRET=$(rand 24)"
    echo "ADMIN_PASSWORD=Test$(rand 9)9"
    echo "SCREEN_KEY_SPIN=scr_$(rand 18)"
    echo "SCREEN_KEY_DIP=scr_$(rand 18)"
  } > "$STATE/secrets.env"
  chmod 600 "$STATE"/*
fi
# Keys added after the first run (older .state files)
grep -q '^SCREEN_KEY_MAIN=' "$STATE/secrets.env" ||
  echo "SCREEN_KEY_MAIN=scr_$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")" >> "$STATE/secrets.env"
set -a; source "$STATE/secrets.env"; set +a
put() { aws ssm put-parameter --name "/lkdr/$STAGE/$1" --type SecureString --value "$2" --overwrite >/dev/null; }
put platform/session-secret "$SESSION_SECRET"
put platform/admin-secret "$ADMIN_SECRET"
put quicklook/client-secret "$QL_CLIENT_SECRET"
put quicklook/webhook-secrets "$QL_WEBHOOK_SECRET"
echo "Secrets stored in SSM Parameter Store under /lkdr/$STAGE/"

# QuickLook Leaderboard API for the Treasure Hunt, per environment. Only stored when given, so a
# later deploy without them keeps what is there. The key is never written to .state or printed.
#   LEADERBOARD_BASE_URL=https://... LEADERBOARD_API_KEY=... npm run deploy
if [ -n "${LEADERBOARD_BASE_URL:-}" ]; then
  aws ssm put-parameter --name "/lkdr/$STAGE/hunt/leaderboard-base-url" --type String \
    --value "$LEADERBOARD_BASE_URL" --overwrite >/dev/null
  echo "Leaderboard API address stored"
fi
if [ -n "${LEADERBOARD_API_KEY:-}" ]; then
  put hunt/leaderboard-api-key "$LEADERBOARD_API_KEY"
  echo "Leaderboard API key stored (SecureString)"
fi

step "CDK bootstrap (once per account and region)"
(cd "$APPS/backend/platform-api" && npx cdk bootstrap "aws://$ACCOUNT/$REGION" >/dev/null)

# Addresses from an earlier run, if any (placeholders on the first run)
existing() { output "$1" "$2" 2>/dev/null | grep -v None || true; }
GAMES_URL="$(existing lkdr-$STAGE-web-games Url)"
HUNT_URL="$(existing lkdr-$STAGE-web-hunt Url)"
SCREENS_URL="$(existing lkdr-$STAGE-web-screens Url)"

platform() {
  cdk_deploy "$APPS/backend/platform-api" \
    -c tokenMode=mock -c qlClientId=lkdr \
    -c gamesWebUrl="${GAMES_URL:-https://placeholder.invalid}" -c huntWebUrl="${HUNT_URL:-https://placeholder.invalid}"
}

step "1/5 Platform API"
platform
API_URL="$(output lkdr-$STAGE-platform ApiUrl)"

step "2/5 Games Event API and Treasure Hunt API"
cdk_deploy "$APPS/backend/games-event-api"
cdk_deploy "$APPS/backend/treasure-hunt-api"
WS_URL="$(output lkdr-$STAGE-games-event ScreensWebSocketUrl)"

step "3/5 Web apps (build, then S3 and CloudFront)"
build() { (cd "$APPS/frontend/$1" && shift && env "$@" npx vite build >/dev/null && echo "built"); }
web_deploy() { (cd "$APPS/frontend/web-infra" && npx cdk deploy --require-approval never --concurrency 3 -c stage=$STAGE "$@"); }
# Visitor apps first: the screens show QR codes that open them (test mode), and admin links to the screens.
# The games address opens the main display (both games on one big screen), which lives on the screens site.
display_url() { echo "$SCREENS_URL/stall?key=$SCREEN_KEY_MAIN"; }
build games-web ${SCREENS_URL:+VITE_TEST_DISPLAY_URL="$(display_url)"}; build hunt-web
web_deploy lkdr-$STAGE-web-games lkdr-$STAGE-web-hunt
GAMES_URL="$(output lkdr-$STAGE-web-games Url)"
HUNT_URL="$(output lkdr-$STAGE-web-hunt Url)"
build screen-web VITE_SCREENS_WS_URL="$WS_URL" VITE_QR_GAMES_URL="$GAMES_URL" VITE_QR_HUNT_URL="$HUNT_URL"
web_deploy lkdr-$STAGE-web-screens
FIRST_SCREENS_URL="${SCREENS_URL:-}"
SCREENS_URL="$(output lkdr-$STAGE-web-screens Url)"
if [ "$FIRST_SCREENS_URL" != "$SCREENS_URL" ]; then # first run: the screens address is known only now
  build games-web VITE_TEST_DISPLAY_URL="$(display_url)"
  web_deploy lkdr-$STAGE-web-games
fi
build admin-web VITE_SCREEN_WEB_URL="$SCREENS_URL"
web_deploy lkdr-$STAGE-web-admin
ADMIN_URL="$(output lkdr-$STAGE-web-admin Url)"

step "4/5 Connect the pieces (platform with the web app addresses)"
platform

step "5/5 Demo data"
if [ "${SKIP_SEED:-}" = 1 ]; then echo "Skipped (SKIP_SEED=1), existing data kept"; else
(cd "$APPS/backend/platform-api" && TABLE_NAME=lkdr-$STAGE-platform BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run -s db:seed-aws)
(cd "$APPS/backend/games-event-api" && TABLE_NAME=lkdr-$STAGE-games-event SEED_DAYS=5 ASSETS_BASE_URL=unused \
  SCREEN_KEY_SPIN="$SCREEN_KEY_SPIN" SCREEN_KEY_DIP="$SCREEN_KEY_DIP" SCREEN_KEY_MAIN="$SCREEN_KEY_MAIN" npm run -s db:seed-aws)
(cd "$APPS/backend/treasure-hunt-api" && TABLE_NAME=lkdr-$STAGE-treasure-hunt PLATFORM_TABLE_NAME=lkdr-$STAGE-platform \
  SEED_DAYS=5 npm run -s db:seed-aws)
fi

cat > "$STATE/urls.env" <<EOF
GAMES_URL=$GAMES_URL
HUNT_URL=$HUNT_URL
ADMIN_URL=$ADMIN_URL
SCREENS_URL=$SCREENS_URL
API_URL=$API_URL
WS_URL=$WS_URL
EOF

step "Default logo artwork (skips logos that already have an image)"
(cd "$HERE" && npx tsx upload-logos.ts)

step "QR codes"
(cd "$HERE" && npx tsx make-qr.ts)

cat <<EOF

Done. Test environment:
  Admin panel         $ADMIN_URL   (user super.admin, password in apps/deploy-test/$STATE_DIR/secrets.env)
  Spin screen (TV)    $SCREENS_URL/stall?key=$SCREEN_KEY_SPIN
  Lucky Dip screen    $SCREENS_URL/stall?key=$SCREEN_KEY_DIP
  Leaderboard screen  $SCREENS_URL/leaderboard
  Main display (16:9) $GAMES_URL   (both games: QR codes, then the live wheel or box)
  QR board (16:9)     $SCREENS_URL/qr
  QR sheet            project/test-kit/qr-sheet${STATE_DIR#.state}.html
Remove everything later with: npm run destroy
EOF
