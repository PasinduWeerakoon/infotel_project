# Treasure Hunt API (Project B)

QuickLook's backend sends every stall scan to this service, encrypted (decision D-20). Rules: [04-treasure-hunt](../../../04-treasure-hunt/).

| Rule | Where |
|---|---|
| Scan message: AES-256-GCM, refused when changed or older than 5 minutes | `domain/scan-message.ts` (tested) |
| Every scan stored with the time received, a resent `event_id` once | `services/scan-service.ts`, `data/scans-repo.ts` |
| Event logos loaded once from QuickLook, count in every session | `services/logo-service.ts`, `data/logos-repo.ts` |
| Each logo counts once per visitor per session, also for parallel scans | `data/players-repo.ts` (`recordLogoScan`, conditional writes) |
| Scan period follows start and end, or when staff opened or ended it early | `domain/rules.ts` (`scanPeriod`, `sessionForScan`, tested) |
| Most logos first, a tie goes to whoever got there first | `domain/rules.ts` (`leaderboardKey`, `withRanks`, tested) |
| At the end: provisional winners, flagged on the participants, confirm, disqualify (next moves up), previous-winner rule | `services/winners-service.ts` |
| Scan key and QuickLook API per environment, backend only | `config.ts` (SSM `/lkdr/{stage}/hunt/*`, or `.env` locally) |

## Routes

QuickLook: `POST /integrations/quicklook/v1/hunt-scans` (`{"data":"<hex>"}`).
Public: `GET /hunt/v1/status`, `GET /hunt/v1/leaderboard` (cached 3 s, player numbers only).
Admin (`/admin/v1/hunt`): sessions, start and end, event logos and loading them, live, participants, scans, winners (confirm, disqualify, collect), winners of the day.

## Scripts

`npm run dev` (port 4002, also takes the scans locally, finalizes ended sessions every `JOB_SECONDS`), `npm run db:setup` (seeds the mock event logos locally), `npm test`, `npm run typecheck`, `npm run lint`.
