# Environments and Deployment

## 1. Environments

| Environment | Purpose | Deployed from |
|---|---|---|
| `dev` | Development, QuickLook test integration, client review | Every merge to `main` |
| `prod` | Live event | Release tag, after approval |

Both use the same CDK code with environment settings (domains, schedules, provisioned concurrency).

## 2. Stacks

| Stack | Owner | Contents |
|---|---|---|
| `Web` | Shared | S3 buckets for the four apps, CloudFront, ACM certificate |
| `Platform` | Shared | HTTP API, Auth, Scan intake, Admin auth, EventBridge bus, `platform` table, SSM parameters |
| `GamesEvent` | Project A | Visitor, Admin, Screen and Jobs Lambdas, WebSocket API, `games-event` table, schedules |
| `TreasureHunt` | Project B | Visitor, Admin and Jobs Lambdas, `treasure-hunt` table, every-minute schedule. QuickLook Leaderboard API address and key in SSM `/lkdr/{stage}/hunt/` |
| `Monitoring` | Shared | CloudWatch dashboard, alarms, budget alert |

Project stacks add their routes to the shared HTTP API through exported references, so each project can be deployed on its own.

## 3. Configuration and secrets

| Item | Location |
|---|---|
| QuickLook client IDs and secrets | SSM Parameter Store (SecureString) `/lkdr/{env}/quicklook/*` |
| Webhook shared secret | SSM `/lkdr/{env}/quicklook/webhook-secret` |
| Session signing key | SSM `/lkdr/{env}/platform/session-key` |
| Domains, schedules, limits | CDK context per environment |

## 4. Pipeline (GitHub Actions)

1. Pull request: install, lint, type-check, unit and API tests, `cdk diff`.
2. Merge to `main`: build, deploy changed stacks to `dev`, run smoke tests.
3. Release tag: deploy the same build to `prod` after approval.

AWS access uses an OIDC role. No AWS keys are stored in GitHub.

## 5. Release and rollback

| Item | Approach |
|---|---|
| Lambdas | Versions behind a `live` alias. Rollback re-points the alias |
| Frontend | Versioned build folders in S3. Rollback re-deploys the previous build |
| Data | DynamoDB point-in-time recovery |
| During the event | Staff can pause a game or end a session from the dashboard while an issue is fixed |

## 6. Event-day settings

| Setting | Value |
|---|---|
| Provisioned concurrency | On for `games-visitor`, `platform-auth`, `platform-scan-intake` during event hours only |
| Lambda concurrency quota | Checked and raised before the event |
| Alarms | 5xx rate, throttles, webhook signature failures, budget |

## 7. Go-live checklist

- [ ] Domains and certificates active
- [ ] QuickLook production client IDs, secrets and webhook URL configured
- [ ] Logo IDs registered (2 game logos, all stalls)
- [ ] Prize catalogue, sessions and allocations entered and checked
- [ ] Treasure Hunt sessions, prizes and stalls entered
- [ ] Stall screen and leaderboard screen keys issued and screens connected
- [ ] Admin users created with the right roles
- [ ] Provisioned concurrency scheduled, alarms active
- [ ] Automated tests passing on `prod` build
