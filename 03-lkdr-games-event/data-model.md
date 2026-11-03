# Project A: Data Model

Table: `games-event` (DynamoDB, on-demand, point-in-time recovery). Single-table design.

## 1. Items

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Prize | `PRIZE#{prizeId}` | `META` | name, stock, isMainPrize, imageKey |
| Session | `SESSION#{sessionId}` | `META` | name, date, startsAt, endsAt, games, status |
| Allocation | `SESSION#{sessionId}` | `ALLOC#{game}#{prizeId}` | allocated, remaining, given |
| Player guard | `SESSION#{sessionId}` | `PLAYER#{userId}` | entryId, game, createdAt |
| Entry | `ENTRY#{entryId}` | `META` | userId, sessionId, game, scanId, screenId, status (ready, played, expired), prizeId, reference, player (name and phone), createdAt, playedAt, idempotencyKey |
| Reference | `REF#{reference}` | `META` | entryId, sessionId, game, prizeId, userId, player (name and phone), collectedAt, collectedBy |
| Screen | `SCREEN#{screenId}` | `META` | name, game list, keyHash, connectionId, lastSeenAt |
| Screen lock | `SCREEN#{screenId}` | `LOCK` | entryId, expiresAt |
| Daily main prize | `USERDAY#{userId}#{date}` | `MAIN` | prizeId, wonAt (repeat-winner rule) |
| Settings | `SETTINGS` | `GLOBAL` | lockTimeoutSeconds, repeatWinnerRule, unusedPrizes, playsPerSession |

`userId` is the opaque QuickLook user ID. No names or contact details are stored.

## 2. Indexes

| Index | PK | SK | Used for |
|---|---|---|---|
| GSI1 | `GSI1PK = SESSION#{sessionId}` | `GSI1SK = PLAYED#{playedAt}` (on entries) | Reports and the live feed per session |
| GSI2 | `GSI2PK = DATE#{date}` | `GSI2SK = {startsAt}` (on sessions) | Sessions for a day, current session lookup |

## 3. Access patterns

| Pattern | Query |
|---|---|
| Current session | GSI2 on today's date, pick the one whose start and end contain now |
| Remaining prizes for a session and game | Query `PK = SESSION#{id}`, `SK begins_with ALLOC#{game}#` |
| Has this visitor played this session | Get `SESSION#{id} / PLAYER#{userId}` |
| Entry state for the result page | Get `ENTRY#{entryId} / META` |
| Prize desk lookup | Get `REF#{reference} / META` |
| Plays for a report | Query GSI1 on the session |

## 4. Transactions

### Create entry (`POST /games/v1/entries`)
`TransactWriteItems`:
1. Put `ENTRY#{entryId}` (status ready) with `attribute_not_exists`.
2. Put `SESSION#{id} / PLAYER#{userId}` with `attribute_not_exists` (one play per session).
3. Update `SCREEN#{id} / LOCK` with condition: no lock or lock expired.
4. Condition check `SESSION#{id} / META` status is `open`.

Before the transaction, the platform table is read to confirm that `SCAN#{scanId}` exists, belongs to this user and has not been used. Then it is marked used (conditional update).

### Play (`POST /games/v1/entries/{entryId}/play`)
1. Read the allocation for the session and game, check for a waiting winning moment and the repeat-winner rule, then pick a prize with a secure random number.
2. `TransactWriteItems`:
   - Update `ALLOC#{game}#{prizeId}`: `remaining - 1`, `given + 1`, condition `remaining > 0`.
   - Update `ENTRY#{entryId}`: status played, prizeId, reference, player, condition `status = ready`.
   - Put `REF#{reference}` with `attribute_not_exists`.
   - Put `USERDAY#{userId}#{date} / MAIN` if a main prize (repeat-winner rule on).
3. On a conditional failure on the allocation, draw again (up to 3 times).

## 5. Platform table items used by Project A

Table `platform` (shared):

| Item | PK | SK | Notes |
|---|---|---|---|
| Scan | `SCAN#{scanId}` | `META` | userId, logoId, logoType, scannedAt, usedBy, TTL 30 days |
| Logo | `LOGO#{logoId}` | `META` | logoType (game, stall, portal), targetId (`spin`, `lucky-dip`, stall ID) |
