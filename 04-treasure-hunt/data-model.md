# Project B: Data Model

Table: `treasure-hunt` (DynamoDB, on-demand, point-in-time recovery). Single-table design.

QuickLook's backend sends every scan to us (decision D-20). We store every scan, the event logos, the counted standings and the winners.

## 1. Items

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Session | `SESSION#{sessionId}` | `META` | name, date, startsAt, endsAt, override, openedAt, closedAt, pointsPerStall, winnersCount, prizes, allowPreviousWinners, finalized |
| Participant | `SESSION#{sessionId}` | `PART#{userId}` | playerNumber, fullName (QuickLook user name), stalls, points, totalScans, reachedAt, logos (logoId, firstScannedAt), disqualified, winnerRank (the winner flag) |
| Visit | `SESSION#{sessionId}` | `VISIT#{userId}#{logoId}` | at. Written once with a condition, so a logo counts once per visitor per session, even for scans sent in parallel |
| Stats | `SESSION#{sessionId}` | `STATS` | scans (received in the session), lastScanAt |
| Player number counter | `SESSION#{sessionId}` | `COUNTER` | next |
| Winner | `SESSION#{sessionId}` | `WINNER#{rank}` | userId, playerNumber, fullName, stalls, points, prizeName, status (provisional, confirmed), confirmedBy, collectedAt, collectedBy |
| Scan | `SCANS#{sessionId}` (or `SCANS#NONE#{date}` outside a session) | `{receivedAt}#{random}` | userId, userName, logoId, eventId, scannedAt, receivedAt, result (counted, repeat, unknown-logo, no-session) |
| Event ID | `EVENT#{eventId}` | `META` | ttl (4 days). A resent scan is stored once |
| Event logo | `LOGOS` | `LOGO#{logoId}` | productName, companyName, logoCode, logoUrl. Loaded once from QuickLook, counts in every session |
| Previous winner | `WINNERDAY#{date}` | `USER#{userId}` | sessionId (for the allowPreviousWinners rule) |

`userId` is QuickLook's user ID. Staff find the phone number with it in QuickLook. No phone numbers are stored for the hunt.

## 2. Indexes

| Index | PK | SK | Used for |
|---|---|---|---|
| GSI1 (leaderboard) | `GSI1PK = LB#{sessionId}` | `GSI1SK = {999999 minus logos, zero padded}#{reachedAt}` (on participants) | Top N in rank order: most logos, then earliest |
| GSI2 | `GSI2PK = DATE#{date}` | `GSI2SK = {startsAt}` (on sessions) | Current and next session lookup |

## 3. Receiving a scan

1. Open the message (AES-256-GCM). Refuse it if it cannot be opened, or its `scanned_at` is older than 5 minutes.
2. If it has an `event_id` already seen, answer "already received" and stop.
3. Find the session whose scan period holds the scan time (`scanned_at`, else the time received). Finalized sessions take no more scans.
4. If the logo is an event logo, put the Visit item with a condition. When it is new, add 1 logo and the points to the participant (created with the next player number on their first logo), then set the leaderboard key for that count.
5. Add 1 to the session's scans, then store the Scan item with its result.

Every minute the `hunt-jobs` Lambda freezes ended sessions, lists their provisional winners and sets `winnerRank` on those participants.

## 4. Access patterns

| Pattern | Query |
|---|---|
| Leaderboard top N | Query GSI1 `LB#{sessionId}`, limit N (cached 3 s) |
| Participants for admins | Query `SESSION#{id}` with `begins_with PART#` |
| A player's scans | Query `SCANS#{sessionId}`, filter on userId |
| Winners | Query `SESSION#{id}` with `begins_with WINNER#` |
