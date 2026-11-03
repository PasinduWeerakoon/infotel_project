# LKDR Admin Dashboard

One web app for LKDR staff and admins, covering **Project A (LKDR Games Event)** and **Project B (Treasure Hunt)**. One URL, one login, clear tabs per project. Each tab calls its own project's admin API, so the projects stay independent on the backend.

## 1. Navigation

```text
LKDR Admin Dashboard
  Overview                       live summary of both events
  Games Event (Project A)
    Live control                 current session, prizes left, screen and lock, pause or open games
    Sessions and prizes          sessions per day, prize allocation per session and game, auto-split
    Prize catalogue              prizes, stock, main prize flag
    Prize desk                   reference lookup, winner name (QuickLook), mark collected
    Stall screens                screens, keys, release lock
    Reports                      plays export, summary per session
  Treasure Hunt (Project B)
    Live                         current session, participants, scans per minute, top 10
    Sessions and prizes          sessions, points per stall, prizes per rank
    Stalls                       participating stalls, QuickLook logo IDs, offerings links
    Participants and scans       participants, scan history, flags
    Winners                      provisional winners, confirm or disqualify, collect
    Reports                      standings and scans export
  Administration
    Users and roles              admin users, roles, reset password, unlock
    Settings                     Project A rules (lock timeout, repeat-winner, unused prizes)
    Audit log                    who changed what and when
```

## 2. Roles and access

| Tab | Super admin | Games admin | Hunt admin | Prize desk | Viewer |
|---|---|---|---|---|---|
| Overview | Yes | Yes | Yes | Yes | Yes |
| Games: Live control | Yes | Yes | No | View | View |
| Games: Sessions and prizes, Prize catalogue, Stall screens | Yes | Yes | No | No | View |
| Games: Prize desk | Yes | Yes | No | Yes | No |
| Games: Reports | Yes | Yes | No | No | Yes |
| Hunt: Live | Yes | No | Yes | View | View |
| Hunt: Sessions and prizes, Stalls, Participants | Yes | No | Yes | No | View |
| Hunt: Winners | Yes | No | Yes | Collect only | View |
| Hunt: Reports | Yes | No | Yes | No | Yes |
| Administration | Yes | No | No | No | No |

## 3. Key screens

### Games Event: Sessions and prizes
- A day view with sessions as rows (for example 09:00 to 13:00, 13:00 to 17:00, 17:00 to 21:00).
- For each session, an allocation grid: prizes as rows, Spin the Wheel and Lucky Dip as columns.
- **Auto-split:** enter daily totals and weights (or "by session length"), preview the result, edit any cell and save.
- Validation shown inline: overlapping sessions, allocation above stock, quantities below what was already given.

### Games Event: Live control
- Session countdown, plays so far, prizes given and left per game.
- Screen status (connected, idle, playing) and lock holder with a "Release lock" button.
- Pause or open each game.

### Games Event: Prize desk
- One search box for the reference.
- Shows prize, game, session, time and collection status.
- "Show winner name" calls QuickLook (shown, not stored).
- "Mark collected" (works once, shows who collected and when if repeated).

### Treasure Hunt: Winners
- Provisional winners after the session ends, with points, stalls, time reached and flags.
- Scan history for each winner.
- Confirm, disqualify (the next rank moves up), show winner name, mark collected.

## 4. APIs used

| Area | API |
|---|---|
| Login, users, audit | `/admin/v1/auth/*`, `/admin/v1/users`, `/admin/v1/audit-log` (shared platform) |
| Games Event tabs | `/admin/v1/games/*` ([Project A API plan](../03-lkdr-games-event/api-plan.md#5-admin-apis-prefix-adminv1games)) |
| Treasure Hunt tabs | `/admin/v1/hunt/*` ([Project B API plan](../04-treasure-hunt/api-plan.md#2-admin-apis-prefix-adminv1hunt)) |

## 5. Login and security

- Built-in admin login: username and password (hashed), lockout after 5 failed attempts for 15 minutes, session ends after 30 minutes of inactivity.
- Admin cookie `lkdr_admin` (HttpOnly, Secure, SameSite=Strict) plus the header `X-LKDR-Admin: 1` on every call.
- Every change is written to the audit log.
