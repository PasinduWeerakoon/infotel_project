# Automated Testing

All tests are automated and run in the pipeline. A release goes out only when they pass.

## 1. Unit tests (domain rules)

| Project | Covered |
|---|---|
| Project A | Auto-split (largest remainder), weighted draw distribution, pacing caps, repeat-winner rule, session overlap validation, allocation limits |
| Project B | Scoring (new stall, duplicate, outside session, not participating), ranking and tie-break, winner selection, disqualification moving ranks up |
| Platform | Webhook signature (including the worked example), timestamp window, session cookie signing |

## 2. API and integration tests (against DynamoDB Local or the dev environment)

| Test | Expected |
|---|---|
| Scan event duplicate delivery | One stored scan, one entry or one point award |
| Entry without a scan event | `SCAN_NOT_FOUND` |
| Entry with another user's scan | `SCAN_NOT_YOURS` |
| Second play in the same session (either game) | `ALREADY_PLAYED_THIS_SESSION` |
| Entry while the screen is locked | `GAME_IN_PROGRESS` |
| Play repeated with the same idempotency key | Same result returned |
| Collect a reference twice | Second call `ALREADY_COLLECTED` |
| Admin route without the right role | 403 |

## 3. Concurrency tests

| Test | Expected |
|---|---|
| 50 parallel entries for one screen | Exactly one succeeds |
| Parallel plays racing for the last unit of a prize | No over-allocation, losers draw again |
| Parallel duplicate scans of one stall | One point award |

## 4. Simulations

| Simulation | Expected |
|---|---|
| Full Project A day (3 sessions, both games) | Given quantities equal allocations, never more |
| Weighted draw over 100,000 runs | Observed shares match remaining ratios within tolerance |
| Full Treasure Hunt session with 500 simulated visitors | Correct standings and tie-breaks |

## 5. Load test

An automated k6 script runs on `dev` before go-live, with QuickLook replaced by the local mock (see [scalability](../02-architecture/scalability.md)).

| Stage | Load |
|---|---|
| Ramp up | 0 to 1,000 requests per second over 2 minutes |
| Hold | 1,000 requests per second for 10 minutes |
| Burst | 2,000 requests per second for 1 minute (session opening) |

Traffic mix: scan events, sign in, entry checks, plays on simulated screens, Treasure Hunt progress and leaderboard reads.

| Pass criteria | Value |
|---|---|
| Failed requests | Under 1% |
| Response time, 95th percentile | Under 300 ms |
| Throttles (Lambda, DynamoDB) | None outside the scoring queue |
| Prize stock | Never below zero, given equals allocated or less |
| Dead-letter queue | Empty at the end |
