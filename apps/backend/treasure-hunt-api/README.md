# Treasure Hunt API (Project B)

QuickLook counts the stall logo scans; this service reads QuickLook's Leaderboard API (decision D-18). Rules: [04-treasure-hunt](../../../04-treasure-hunt/).

| Rule | Where |
|---|---|
| Only the session's selected QuickLook logos count | `logos` on the session, sent as `logo_ids` (`services/sync-service.ts`) |
| Standings read every 15 seconds while a session runs, stored per participant | `services/sync-service.ts`, `handlers/jobs.ts` |
| Scan period follows start and end, or when staff opened or ended it early | `domain/rules.ts` (`scanPeriod`, tested) |
| Leaderboard in QuickLook's rank order | `domain/rules.ts` (leaderboard key, tested) |
| Final read at the end, then provisional winners, confirm, disqualify (next moves up), previous-winner rule | `services/winners-service.ts` |
| Leaderboard API address and key per environment, backend only | `config.ts` (SSM `/lkdr/{stage}/hunt/*`, or `.env` locally), `data/quicklook-leaderboard.ts` |

## Routes

Visitor: `GET /hunt/v1/status`, `GET /hunt/v1/me`, `GET /hunt/v1/leaderboard` (public, cached 3 s, player numbers only).
Admin (`/admin/v1/hunt`): sessions, start and end, logos, QuickLook logo search, read now, live, participants, winners (confirm, disqualify, collect), winners of the day.

## Scripts

`npm run dev` (port 4002, reads open sessions every `SYNC_SECONDS`, the QuickLook mock on port 4010 answers the Leaderboard API), `npm run db:setup`, `npm test`, `npm run typecheck`, `npm run lint`.
