# Games Event API (Project A)

Spin the Wheel and Lucky Dip. Rules: [03-lkdr-games-event](../../../03-lkdr-games-event/).

| Rule | Where |
|---|---|
| One play per visitor per session, across both games | `data/entries-repo.ts` (conditional player guard in the entry transaction) |
| One player per stall screen | screen lock in the same transaction, released after the animation or the timeout |
| Winning moments spread across the session, weighted pick, repeat-winner rule | `domain/release-schedule.ts`, `domain/draw.ts` (pure, tested) |
| Never more than allocated | conditional decrement, draw again on a clash (`services/play-service.ts`) |
| Auto-split with the largest remainder method, stock checks | `domain/allocation.ts` (pure, tested) |
| Sessions from the clock with staff overrides, no overlaps | `domain/sessions.ts` (pure, tested) |

## Routes

Visitor: `GET /games/v1/status`, `POST /games/v1/entries`, `GET /games/v1/entries/:id`, `POST /games/v1/entries/:id/play`.
Admin (`/admin/v1/games`): sessions, allocation and auto-split, prizes, game pause, settings, live, screens, references (prize desk), plays report.
Stall screens: WebSocket `$connect?screenKey=`, messages `screen.state`, `entry.started`, `play.result`, `entry.ended`, `refresh`.

## Structure

`domain/` pure rules, `data/` DynamoDB, `services/` visitor flow and screens, `routes/` HTTP, `handlers/` Lambdas
(visitor, admin, screen, jobs), `local/` dev server with a WebSocket stand-in, `infra/` CDK, `test/` unit tests.

## Scripts

`npm run dev` (port 4001, WebSocket on `/screens`), `npm run db:setup`, `npm test`, `npm run typecheck`, `npm run lint`.
Local screen keys: `scr_local_spin`, `scr_local_dip`.
