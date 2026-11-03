# Backend Architecture

## 1. Runtime

| Area | Choice |
|---|---|
| Compute | AWS Lambda, Node.js 22, TypeScript, ARM64 |
| HTTP APIs | API Gateway HTTP API |
| Real time | API Gateway WebSocket API (stall screen) |
| Events | EventBridge bus `lkdr-games` for scan events. The Treasure Hunt reads QuickLook's Leaderboard API instead (D-18) |
| Scheduling | EventBridge Scheduler |
| Data | DynamoDB on-demand, one table per area |
| Secrets | SSM Parameter Store (SecureString) |
| Logs and metrics | CloudWatch (structured JSON logs) |

## 2. Lambda functions

| Function | Stack | Trigger | Responsibility |
|---|---|---|---|
| `platform-auth` | Platform | HTTP `/auth/v1/*` | OIDC login and callback, session cookie, session check, logout |
| `platform-scan-intake` | Platform | HTTP `POST /integrations/quicklook/v1/scan-events` | Verify signature, store scan once, publish `scan.received` |
| `platform-admin` | Platform | HTTP `/admin/v1/auth/*`, `/admin/v1/users`, `/admin/v1/logos`, `/admin/v1/uploads`, `/admin/v1/quicklook/*`, `/platform/v1/logos` | Admin login, roles, lockout, users, logos, image uploads, QuickLook name lookup. Every service checks the signed admin cookie and role itself |
| `games-visitor` | Project A | HTTP `/games/v1/*` | Status, entries, play, results |
| `games-admin` | Project A | HTTP `/admin/v1/games/*` | Prizes, sessions, allocations, live control, prize desk, reports, settings |
| `games-screen` | Project A | WebSocket `$connect`, `$disconnect`, `screen.hello`, `animation.finished` | Stall screen sync, lock release |
| `games-jobs` | Project A | Scheduler | Open and close sessions, expire stale entries and locks, roll over unused prizes if enabled |
| `hunt-jobs` | Project B | Every minute | Read hunt standings from QuickLook every 15 seconds while a session runs, then work out winners |
| `hunt-visitor` | Project B | HTTP `/hunt/v1/*` | Status, scan result, my score, leaderboard |
| `hunt-admin` | Project B | HTTP `/admin/v1/hunt/*` | Sessions, session prizes, stalls, participants, scans, winners, reports |
| `hunt-jobs` | Project B | Scheduler | Open and close sessions, freeze standings, mark prize ranks |

## 3. Event routing

```text
QuickLook  POST scan event
   platform-scan-intake: verify, store SCAN#{scanId} once, look up LOGO#{logoId}
   EventBridge bus "lkdr-games", event "scan.received"
      rule logoType = "game"   not routed (Project A reads the stored scan when the visitor creates an entry)
      rule logoType = "stall"  not routed (QuickLook counts hunt scans, the hunt reads its Leaderboard API, D-18)
      rule logoType = "portal" not routed (portals count scans themselves)
```

Event detail:

```json
{
  "scanId": "qls_01HF8Z3K2M",
  "userId": "ql_pw_8f3a2c91",
  "logoId": "logo_stall_017",
  "logoType": "stall",
  "targetId": "stall_017",
  "scannedAt": "2026-11-02T10:14:05+05:30"
}
```

## 4. Consistency rules

| Rule | How |
|---|---|
| A scan is processed once | `SCAN#{scanId}` written with `attribute_not_exists`. Retries return 202 without a second event |
| One play per visitor per session | `SESSION#{id} / PLAYER#{userId}` written with `attribute_not_exists` inside the entry transaction |
| One player per stall screen | `SCREEN#{id} / LOCK` conditional write (free or expired) inside the entry transaction |
| No over-allocation | Allocation decremented with `remaining > 0` inside the play transaction. Retry up to 3 times on conflict |
| One count per stall logo per visitor per session | Done by QuickLook's Leaderboard API (distinct logos in the period) |
| Repeated requests are safe | A scan creates at most one entry and an entry has one result. Repeating a request (refresh, double tap) returns the stored entry or result |

## 5. Scheduler jobs

| Schedule | Job |
|---|---|
| At each session start and end (created when a session is saved) | Open or close the session |
| Every minute during event hours | Expire entries not played within the lock timeout, release expired screen locks |
| At each Treasure Hunt session end | Freeze standings, mark prize ranks |

## 6. Error format

Every API returns errors in one shape:

```json
{
  "error": {
    "code": "ALREADY_PLAYED_THIS_SESSION",
    "message": "You have already played in this session. Please come back in the next session.",
    "details": { "nextSessionStartsAt": "2026-11-02T13:00:00+05:30" }
  }
}
```

The error codes for each project are listed in their API plans.

## 7. Logging and observability

| Item | Detail |
|---|---|
| Logs | JSON with `requestId`, `route`, `sessionId`, `entryId` or `scanId`, `durationMs`. No personal data |
| Metrics | Plays, prizes left per session, scan events received and rejected, scoring lag, lock timeouts |
| Alarms | 5xx rate, Lambda throttles, scan events failing signature checks |
| Budget | AWS Budgets alert on monthly spend |
