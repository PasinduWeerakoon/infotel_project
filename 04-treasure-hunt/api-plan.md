# Project B: API Plan

Base URL: `https://api.<domain>` (to be confirmed). Conventions are the same as Project A ([api-plan](../03-lkdr-games-event/api-plan.md#1-conventions)). Full schema: [openapi.yaml](openapi.yaml).

QuickLook's backend sends every scan to our scan endpoint (decision D-20, part E of the [QuickLook contract](../06-quicklook-integration/integration-contract.md)). Visitors do not sign in to the hunt.

## 1. Visitor APIs

| Method | Path | Purpose | Main responses |
|---|---|---|---|
| GET | `/hunt/v1/status` | Current or next session, state, server time | 200 |
| GET | `/hunt/v1/leaderboard?sessionId=&top=10&page=` | Top N by rank (cached 3 to 5 s). With `page` (from 1), one page of every player, 10 per page, with `page` and `pages` in the answer. The phone leaderboard uses pages, the big screen uses top 10 | 200 |

### Example: leaderboard
```json
{
  "sessionId": "hunt_20261102_1",
  "state": "active",
  "endsAt": "2026-11-02T12:00:00+05:30",
  "serverTime": "2026-11-02T11:21:40+05:30",
  "top": [
    { "rank": 1, "playerNumber": 12, "points": 110, "stalls": 11 },
    { "rank": 2, "playerNumber": 27, "points": 100, "stalls": 10 }
  ]
}
```

### Error codes
| Code | HTTP | Meaning |
|---|---|---|
| `NO_SESSION` | 404 | No current or upcoming session |

## 2. Admin APIs (prefix `/admin/v1/hunt`)

| Method | Path | Purpose | Role |
|---|---|---|---|
| GET, POST | `/sessions?date=` | List (with players, scans and the last scan time) and create sessions | Hunt admin |
| PUT, DELETE | `/sessions/{sessionId}` | Update, delete (only before it starts) | Hunt admin |
| POST | `/sessions/{sessionId}/start`, `/end` | Start or end early (the scan period follows) | Hunt admin |
| GET | `/sessions/{sessionId}/live` | Players, scans, last scan, top 10 with names | Viewer and above |
| GET | `/sessions/{sessionId}/participants` | Ranked standings with user names, QuickLook user IDs and the winner flag | Hunt admin, viewer |
| GET | `/sessions/{sessionId}/scans?userId=` | Every scan received (newest first) | Hunt admin, viewer |
| GET | `/sessions/{sessionId}/winners` | Provisional and confirmed winners | Hunt admin, prize desk |
| POST | `/sessions/{sessionId}/winners/{rank}/confirm` | Confirm a winner | Hunt admin |
| POST | `/sessions/{sessionId}/winners/{rank}/disqualify` | Disqualify, next rank moves up | Hunt admin |
| POST | `/sessions/{sessionId}/winners/{rank}/collect` | Mark the prize collected once | Prize desk |
| GET | `/winners?date=` | Confirmed winners of a day (prize desk) | Hunt admin, prize desk |

## 3. Scan API (called by QuickLook's backend)

| Method | Path | Purpose |
|---|---|---|
| POST | `/integrations/quicklook/v1/hunt-scans` | One stall logo scan, `{"data":"<hex>"}`, encrypted with the environment's scan key (part E of the QuickLook contract) |

## 4. Logos

There is no logo list. QuickLook sends scans of the hunt's allocated logos only, and every logo counts.
