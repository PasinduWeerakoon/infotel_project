# Project B: API Plan

Base URL: `https://api.<domain>` (to be confirmed). Conventions are the same as Project A ([api-plan](../03-lkdr-games-event/api-plan.md#1-conventions)). Full schema: [openapi.yaml](openapi.yaml).

Visitor sign-in is a shared platform endpoint (see the [QuickLook contract](../06-quicklook-integration/integration-contract.md)). Scans are counted by QuickLook and read from its Leaderboard API (decision D-18), so the hunt has no scan endpoint.

## 1. Visitor APIs

| Method | Path | Purpose | Main responses |
|---|---|---|---|
| GET | `/hunt/v1/status` | Current or next session, state, server time | 200 |
| GET | `/hunt/v1/me` | Player number, points, rank, the logos found (name, company, first scanned), last read time | 200, 401 |
| GET | `/hunt/v1/leaderboard?sessionId=&top=10` | Top N by rank (cached 3 to 5 s) | 200 |

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
| GET, POST | `/sessions?date=` | List (with players and the last read from QuickLook) and create sessions (optionally with the logos of another session) | Hunt admin |
| PUT, DELETE | `/sessions/{sessionId}` | Update, delete (only before it starts) | Hunt admin |
| POST | `/sessions/{sessionId}/start`, `/end` | Start or end early (the period sent to QuickLook follows) | Hunt admin |
| PUT | `/sessions/{sessionId}/logos` | The QuickLook logos that count (at most 100, until finalized) | Hunt admin |
| GET | `/quicklook-logos?name=&company=&logoCode=&page=` | Search QuickLook's registered logos | Hunt admin |
| POST | `/sessions/{sessionId}/sync` | Read the standings from QuickLook now | Hunt admin |
| GET | `/sessions/{sessionId}/live` | Players, last read, top 10 with names | Viewer and above |
| GET | `/sessions/{sessionId}/participants` | Standings with names and mobile numbers | Hunt admin, viewer |
| GET | `/sessions/{sessionId}/winners` | Provisional and confirmed winners | Hunt admin, prize desk |
| POST | `/sessions/{sessionId}/winners/{rank}/confirm` | Confirm a winner | Hunt admin |
| POST | `/sessions/{sessionId}/winners/{rank}/disqualify` | Disqualify, next rank moves up | Hunt admin |
| POST | `/sessions/{sessionId}/winners/{rank}/collect` | Mark the prize collected once | Prize desk |
| GET | `/winners?date=` | Confirmed winners of a day (prize desk) | Hunt admin, prize desk |

## 3. QuickLook Leaderboard API (called by our backend)

| Route | Used for |
|---|---|
| `GET /leaderboard/scans/export` (X-API-Key) | Standings of a session period for the selected logos, with full names and mobile numbers, up to 1,000 rows |
| `GET /leaderboard/logos` (X-API-Key) | The logo search behind the admin's logo picker |

The key is per environment, kept in SSM and used only by the backend.
