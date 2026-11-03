# Project B: Treasure Hunt

## 1. Summary

An exhibition-wide game. During a session (for example 10:00 to 12:00), visitors scan as many different stall logos as possible with the QuickLook app. Each new stall adds points. The top visitors when the session ends win the session's prizes.

**QuickLook counts the scans** (decision D-18). It ranks visitors by the number of different event logos scanned in a period, and gives us the ranking through its Leaderboard API. We read it about every 15 seconds while a session runs, store what we read, and work out the winners from the final standings.

## 2. Visitor journey

1. Sign in to the QuickLook app and scan stall logos during the session. Only signed-in scans count.
2. QuickLook counts each event logo once per visitor in the session period.
3. Our backend reads the ranking from QuickLook about every 15 seconds and stores it.
4. The visitor opens our hunt page to see points, rank and the stalls found. The leaderboard screen shows the top players.
5. At the session end we read the final standings once more, list the provisional winners, and staff confirm them in the LKDR Admin Dashboard.
6. Winners collect their prize at the LKDR stall.

## 3. Logos taking part

QuickLook has many registered logos, most of them not part of this event. Before a session starts, the admin opens **Choose** in the Logos column of the hunt sessions page, searches QuickLook's logos and ticks the event's ones. Only scans of the selected logos count (they are sent to QuickLook as `logo_ids`). A new session can start with the logos of an earlier session, and the selection can be changed until the winners are worked out.

## 4. Identity

- Visitors sign in with QuickLook. Our user ID is QuickLook's user ID, the same ID the Leaderboard API returns.
- The public leaderboard screen and the visitor's pages show a **player number** (for example "Player #27"), never names or phone numbers.
- Staff see the full name and mobile number from QuickLook's leaderboard export, to check winners and hand over prizes.

## 5. Connection per environment

| Setting | Where |
|---|---|
| Leaderboard API address | SSM `/lkdr/{stage}/hunt/leaderboard-base-url` (String) |
| Leaderboard API key | SSM `/lkdr/{stage}/hunt/leaderboard-api-key` (SecureString), backend only |

The deploy script stores them when given: `LEADERBOARD_BASE_URL=... LEADERBOARD_API_KEY=... npm run deploy`. Until they are set, the admin shows "not connected" and nothing is read. Locally the QuickLook mock answers the Leaderboard API.

## 6. Documents

| Document | Contents |
|---|---|
| [rules-sessions-and-prizes.md](rules-sessions-and-prizes.md) | Sessions, logos, counting, ranking, prizes, winners, edge cases |
| [data-model.md](data-model.md) | DynamoDB table `treasure-hunt` |
| [api-plan.md](api-plan.md) | Visitor and admin APIs |
| [openapi.yaml](openapi.yaml) | OpenAPI 3.1 specification (earlier design, see api-plan.md for the current routes) |
