# Project A: API Plan

Base URL: `https://api.<domain>` (to be confirmed). All times ISO 8601 with offset (Asia/Colombo). Full schema: [openapi.yaml](openapi.yaml).

## 1. Conventions

| Item | Rule |
|---|---|
| Visitor auth | Cookie `lkdr_session` from the shared Auth service |
| Admin auth | Cookie `lkdr_admin` plus header `X-LKDR-Admin: 1`, role checked per route |
| Repeated requests | Safe without extra headers: the same scan returns the same entry, and playing again returns the stored result |
| Errors | `{ "error": { "code", "message", "details" } }` |
| Versioning | `/v1/` in the path |

## 2. Shared platform endpoints used by Project A

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/v1/login?returnTo=` | Start QuickLook sign-in (silent with `prompt=none` when possible) |
| GET | `/auth/v1/callback` | OpenID Connect callback, sets `lkdr_session` |
| GET | `/auth/v1/session` | Current visitor: opaque user reference, display name, expiry |
| POST | `/auth/v1/logout` | Clear the session |
| POST | `/integrations/quicklook/v1/scan-events` | QuickLook scan event webhook (see the [contract](../06-quicklook-integration/integration-contract.md)) |

## 3. Visitor APIs

| Method | Path | Purpose | Main responses |
|---|---|---|---|
| GET | `/games/v1/status` | Current session, open games, screen state, next session | 200 |
| POST | `/games/v1/entries` | Create an entry from a scan (checks scan, session, one play per session, screen lock) | 201, 409, 422 |
| GET | `/games/v1/entries/{entryId}` | Entry state and result (for refresh and the result page) | 200, 404 |
| POST | `/games/v1/entries/{entryId}/play` | Draw the prize, return the result and animation target. Both games need `{ player: { name, phone } }` typed on the phone (422 PLAYER_DETAILS_REQUIRED without it) | 200, 409, 422 |
| GET | `/games/v1/me/results` | The visitor's results and references for today | 200 |

### Example: create entry
```http
POST /games/v1/entries
Content-Type: application/json

{ "scanId": "qls_01HF8Z3K2M" }
```
```json
{
  "entryId": "ent_01HF8Z4A7Q",
  "game": "spin",
  "sessionId": "ses_20261102_1",
  "status": "ready",
  "expiresAt": "2026-11-02T10:15:05+05:30"
}
```

### Example: play
```json
{
  "entryId": "ent_01HF8Z4A7Q",
  "status": "played",
  "prize": { "prizeId": "pen-drive", "name": "Pen drive", "isMainPrize": true },
  "reference": "LKDR-SW-7K3Q9X",
  "animation": { "target": 2, "durationMs": 6000 }
}
```

### Error codes
| Code | HTTP | Meaning |
|---|---|---|
| `SCAN_NOT_FOUND` | 422 | No QuickLook scan event for this scan ID (after waiting up to 3 s) |
| `SCAN_NOT_YOURS` | 422 | The scan belongs to another QuickLook user |
| `SCAN_ALREADY_USED` | 409 | The scan already created an entry. The existing entry is returned in `details` |
| `SESSION_CLOSED` | 409 | No open session. `details.nextSessionStartsAt` |
| `GAME_PAUSED` | 409 | The game is paused by staff |
| `ALREADY_PLAYED_THIS_SESSION` | 409 | The visitor already played in this session (either game) |
| `GAME_IN_PROGRESS` | 409 | Another visitor is playing on the stall screen |
| `NO_PRIZES_LEFT` | 409 | The session allocation for this game is used up |
| `ENTRY_EXPIRED` | 409 | The entry was not played within the lock timeout |
| `MAIN_PRIZE_ALREADY_WON` | 409 | Repeat-winner rule on, no non-main prizes left |
| `PLAY_IN_PROGRESS` | 409 | Admin: cannot close the session or pause the game while a visitor is playing |
| `ANOTHER_SESSION_OPEN` | 409 | Admin: another session is running, close it before opening this one |
| `NOT_NEXT_SESSION` | 409 | Admin: an earlier session of today is still waiting to start |
| `NOT_TODAY` | 409 | Admin: only today's sessions can be opened early |
| `ALREADY_ENDED` | 409 | Admin: the session has passed its end time |
| `ALLOCATION_BUSY` | 409 | Admin: another allocation save is running, try again |

## 4. Stall screen WebSocket

URL: `wss://ws.<domain>/screens?screenKey=...`

| Direction | Message | Payload |
|---|---|---|
| Screen to server | `screen.hello` | screenId |
| Server to screen | `screen.state` | idle, busy, closed, next session time |
| Server to screen | `entry.started` | entryId, game, expiresAt (no name) |
| Server to screen | `play.result` | entryId, game, animation target, prize name, durationMs |
| Screen to server | `animation.finished` | entryId (releases the screen lock) |
| Server to screen | `ping` / Screen to server `pong` | Keep alive every 30 s |

The reference is never sent to the screen.

## 5. Admin APIs (prefix `/admin/v1/games`)

| Method | Path | Purpose | Role |
|---|---|---|---|
| GET, POST | `/prizes` | List and create prizes | Games admin |
| PUT, DELETE | `/prizes/{prizeId}` | Update, delete (only if never allocated) | Games admin |
| GET, POST | `/sessions?date=` | List and create sessions | Games admin |
| GET, PUT, DELETE | `/sessions/{sessionId}` | Read, update, delete (only if no plays) | Games admin |
| POST | `/sessions/{sessionId}/open`, `/close` | Open or close early | Games admin |
| GET, PUT | `/sessions/{sessionId}/allocation` | Read and set quantities per game and prize | Games admin |
| POST | `/allocations/auto-split` | Preview a split of daily totals across sessions (`apply: true` saves it) | Games admin |
| PUT | `/games/{game}/status` | Open or pause a game | Games admin |
| GET | `/live` | Current session, remaining per prize and game, plays, lock holder, screen connection | Viewer and above |
| GET, POST | `/screens` | List screens, create a screen and get its key once | Games admin |
| POST | `/screens/{screenId}/release-lock` | Release a stuck lock | Games admin |
| GET | `/references?q=` | Prize desk search by reference ID or part of a player name (latest 30 sessions, 20 results) | Prize desk |
| GET | `/references/{reference}` | Prize desk lookup (prize, session, time, collected, player name and phone) | Prize desk |
| GET | `/admin/v1/quicklook/users/{userId}/name` (platform) | Winner's display name from QuickLook, not stored | Prize desk |
| POST | `/references/{reference}/collect` | Mark collected once (409 if already collected) | Prize desk |
| GET | `/reports/plays?date=&format=csv` | Plays export (opaque IDs only) | Viewer and above |
| GET | `/reports/summary?date=` | Given and remaining per session, game and prize | Viewer and above |
| GET, PUT | `/settings` | Lock timeout, repeat-winner rule, unused prizes | Super admin |

### Example: auto-split preview
```json
{
  "date": "2026-11-02",
  "game": "spin",
  "totals": { "pen-drive": 25, "domain": 10, "headset": 10, "power-bank": 10, "umbrella": 5, "chocolate": 80 },
  "weights": { "ses_20261102_1": 42, "ses_20261102_2": 45, "ses_20261102_3": 53 },
  "apply": false
}
```
