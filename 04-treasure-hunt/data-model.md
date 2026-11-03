# Project B: Data Model

Table: `treasure-hunt` (DynamoDB, on-demand, point-in-time recovery). Single-table design.

QuickLook counts the scans (decision D-18). We store the logos selected for each session, what we read from QuickLook's Leaderboard API, and the winners.

## 1. Items

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Session | `SESSION#{sessionId}` | `META` | name, date, startsAt, endsAt, override, openedAt, closedAt, pointsPerStall, winnersCount, prizes, allowPreviousWinners, logos (the selected QuickLook logos: logoId, productName, companyName, logoCode, logoUrl), finalized |
| Participant | `SESSION#{sessionId}` | `PART#{userId}` | playerNumber, fullName, mobile, rank (QuickLook's), stalls, points, totalScans, reachedAt, logos (logoId, firstScannedAt), disqualified |
| Sync status | `SESSION#{sessionId}` | `SYNC` | lastSyncAt, participants (QuickLook's total), unknownLogoIds, error |
| Player number counter | `SESSION#{sessionId}` | `COUNTER` | next |
| Winner | `SESSION#{sessionId}` | `WINNER#{rank}` | userId, playerNumber, fullName, mobile, stalls, points, prizeName, status (provisional, confirmed), confirmedBy, collectedAt, collectedBy |
| Previous winner | `WINNERDAY#{date}` | `USER#{userId}` | sessionId (for the allowPreviousWinners rule) |

`userId` is QuickLook's user ID. Names and mobile numbers come from QuickLook's leaderboard export and are shown to staff only.

## 2. Indexes

| Index | PK | SK | Used for |
|---|---|---|---|
| GSI1 (leaderboard) | `GSI1PK = LB#{sessionId}` | `GSI1SK = {QuickLook rank, zero padded}` (on participants) | Top N in rank order, and a visitor's rank |
| GSI2 | `GSI2PK = DATE#{date}` | `GSI2SK = {startsAt}` (on sessions) | Current and next session lookup |

## 3. Reading QuickLook (sync)

While a session runs, the `hunt-jobs` Lambda (every minute) reads it four times, about 15 seconds apart:
1. `GET /leaderboard/scans/export` with the session period (start or opened early, end or ended early), the selected `logo_ids` and `limit=1000`.
2. For each row, put the participant if anything changed (a new visitor gets the next player number).
3. Visitors QuickLook no longer lists (for example after a logo was deselected) get 0 stalls and rank 999999.
4. Put the sync status (time, total participants, unknown logo IDs, or the error).

After the end, the job reads the final standings once more, then marks the session finalized and lists the provisional winners. If QuickLook cannot be read, it tries again on the next run, so winners never come from old standings.

## 4. Access patterns

| Pattern | Query |
|---|---|
| My score and rank | Get `PART#{userId}`, then count entries ahead on GSI1 |
| Leaderboard top N | Query GSI1 `LB#{sessionId}`, limit N (cached 3 s) |
| Participants for admins | Query `SESSION#{id}` with `begins_with PART#` |
| Winners | Query `SESSION#{id}` with `begins_with WINNER#` |
