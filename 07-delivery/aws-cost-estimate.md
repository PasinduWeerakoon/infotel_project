# AWS Cost Estimate

Region Asia Pacific (Mumbai). Prices are approximate list prices in USD, before tax, and should be confirmed in the
AWS Pricing Calculator before sharing with LKDR. The AWS Free Tier would reduce the small amounts further.

## 1. Assumptions

| Item | Expected event | Heavy case (stress level) |
|---|---|---|
| Event days | 4 | 4 |
| Visitors per day | 5,000 | Far more |
| Games plays per day | About 2,000 (one player at a time per stall screen) | Same, the screens are the limit |
| Treasure Hunt scans per day | About 50,000 (10 stalls per visitor) | Much more |
| API requests over the event | About 4 million | About 115 million (1,000 per second, 8 hours a day) |
| Warm Lambdas (provisioned) | 4 busy functions, 20 each, 12 hours a day | Same |

## 2. Cost for the event (4 days)

| Service | Expected | Heavy case |
|---|---|---|
| API Gateway (HTTP and WebSocket) | 5 | 120 |
| Lambda (requests and run time) | 5 | 140 |
| Lambda warm instances on event days | 25 | 25 |
| DynamoDB (on-demand, backups) | 3 | 45 |
| CloudFront (requests and data, pages and APIs) | 10 | 190 |
| EventBridge and SQS | 1 | 10 |
| CloudWatch (logs, alarms, dashboard) | 5 | 40 |
| S3, Parameter Store, certificates | 1 | 1 |
| **Total for the event** | **about USD 55** | **about USD 570** |

## 3. Cost outside the event

| Item | Per month |
|---|---|
| Each environment while idle (dev or prod): dashboard, alarms, backups, small storage | about USD 5 to 10 |
| DNS hosted zone, if the domain is managed in Route 53 | USD 0.50 |
| Development testing (dev environment, light use) | under USD 10 |

Nothing runs servers while idle. Lambda, API Gateway and DynamoDB on-demand cost nothing when unused.

## 4. How the cost is kept low

| Choice | Effect |
|---|---|
| Serverless only, no servers or databases running all the time | Idle cost close to zero |
| No AWS WAF, no Secrets Manager, no Cognito | Saves about USD 30 to 60 a month (agreed decision) |
| Warm Lambdas only during event hours | The largest fixed item, switched off after the event |
| Short in-memory caches (sessions, logos, leaderboard) | Fewer database reads and API calls |
| Logs without personal data, kept 30 days | Small CloudWatch cost |
| Budget alarm | Early warning if spend goes above the plan |
