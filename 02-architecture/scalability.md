# Scalability and Performance

## 1. Target

The system is designed and tested for **1,000 requests per second** sustained, with headroom to **2,000 requests per second** for short bursts (for example when a session opens and a crowd scans at once).

| Item | Estimate at 1,000 requests per second |
|---|---|
| Lambda duration | About 100 to 200 ms (sign in can be longer while waiting for QuickLook) |
| Lambdas running at once | About 150 normally, up to about 500 if QuickLook sign in is slow |
| DynamoDB writes | About 1,000 to 2,000 per second |
| Scan events (QuickLook webhook) | Up to hundreds per second in bursts |
| Plays (Spin the Wheel, Lucky Dip) | A few per minute per stall screen, because one player uses a screen at a time |

## 2. Capacity

| Service | Default capacity | At 1,000 requests per second |
|---|---|---|
| CloudFront | Millions of requests | Pages, images and the cached leaderboard. Most traffic ends here |
| API Gateway HTTP API | 10,000 requests per second per region | About 10% used |
| Lambda concurrency | 1,000 per account by default. New accounts can start lower | About 150 to 500. Quota raised to 3,000 |
| Lambda scaling speed | Up to 1,000 new instances every 10 seconds per function | A crowd arriving in seconds is absorbed. Hot functions are pre-warmed |
| DynamoDB on-demand | A new table serves 4,000 writes and 12,000 reads per second immediately | About 1,000 to 2,000 writes per second |
| DynamoDB per key | About 1,000 writes and 3,000 reads per second on one partition key | Only the leaderboard index comes close (see section 3) |
| EventBridge | Regional quota for events per second | Check the quota for the chosen region on day 1 |
| SSM Parameter Store | About 40 reads per second (standard throughput) | Never read per request. Cached in memory (see section 3) |

## 3. Measures

| Measure | Why |
|---|---|
| Check the Lambda concurrency quota on day 1 and request 3,000 | New accounts can start with a low limit. Sign in waits on QuickLook, which raises concurrency |
| Provisioned concurrency for `games-visitor`, `platform-auth`, `platform-scan-intake` during event hours only | No cold starts when a crowd arrives |
| Secrets and settings from SSM loaded once per Lambda instance and kept in memory (Powertools Parameters with caching) | SSM allows only about 40 reads per second. Reading it per request would fail long before 1,000 requests per second |
| QuickLook signing keys (JWKS) cached in memory, refreshed only when an unknown key appears | No extra call to QuickLook for every token check |
| Leaderboard snapshot rebuilt every 3 to 5 seconds and served from CloudFront | 1,000 viewers cost one backend read every few seconds, not 1,000 |
| Per-visitor, per-stall and per-session records, no single global counter | Spreads writes across many keys |
| Prize stock decremented with conditional writes | Correct under parallel plays. Plays are naturally limited by one player per screen |
| Generous per-IP limits, strict per-session limits | Venue Wi-Fi puts many visitors behind one IP address |
| Small bundles and CDN assets | Exhibition Wi-Fi is often congested |

## 4. Limits outside our control

| Item | Note |
|---|---|
| QuickLook sign in and webhook throughput | If QuickLook handles fewer than 1,000 requests per second, that becomes the real limit. Confirm with Dilshan A and Dilshan W (Q-QL-10) |
| Stall screen throughput | One player per screen, about 30 seconds per play. Crowds see "Game in progress" |
| Venue internet | The biggest practical risk. Screens keep the last state and reconnect. Phones retry safely |

## 5. Cost at the target

At a sustained 1,000 requests per second for a full 8 hour day (about 29 million requests), the AWS cost is roughly USD 130 to 150 for that day, including CloudFront request fees (the APIs are served through CloudFront). The expected event costs about USD 55 in total. Details: [AWS cost estimate](../07-delivery/aws-cost-estimate.md).

## 6. Verification

An automated k6 load test runs on the `dev` environment before go-live, with QuickLook replaced by the local mock. Details and pass criteria: [testing](../07-delivery/testing.md#5-load-test).

Treasure Hunt scans are counted by QuickLook (decision D-18). The hunt reads one export per running session every 15 seconds, so its load does not grow with the number of scans.
