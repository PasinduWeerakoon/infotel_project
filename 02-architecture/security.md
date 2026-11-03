# Security

## 1. Principles

1. Every decision (who may play, what is won, whether points are added) is made on the server.
2. A scan counts only when QuickLook reports it server to server.
3. No QuickLook tokens are stored on our side. The only visitor personal data is the name and phone number a games player types before playing (decision D-17), kept with the play and the prize reference and never logged.
4. Every write that matters is conditional and idempotent.

## 2. Visitor identity and data

| Item | Approach |
|---|---|
| Identity | QuickLook OpenID Connect. We keep only the opaque per-application user ID (pairwise `sub`) |
| Display name | From the ID token, kept only inside the signed session cookie. Never written to DynamoDB |
| Session | Signed cookie `lkdr_session` (HttpOnly, Secure, SameSite=Lax for the login redirect), 30 minutes, renewed by silent re-login |
| Winner names for the prize desk | QuickLook lookup API, called only for one winner at a time, shown and not stored |
| Exports for LKDR | Opaque IDs and results only. Contact details, if needed, come from QuickLook |

## 3. Threats and controls

| Threat | Control |
|---|---|
| Playing or scoring without a real scan (typed, shared or edited URLs) | Only scan IDs received through the signed webhook are accepted. URLs carry a scan ID only, never trusted data |
| Forged scan events | HMAC-SHA256 signature over timestamp and body, 5 minute timestamp window, unique scan ID |
| Replayed scan events | `SCAN#{scanId}` stored once. A scan ID can create one entry or one point award |
| Using someone else's scan | The entry checks that the scan's user ID matches the signed-in visitor |
| Playing twice in a session | Conditional `PLAYER` record per session and user, across both games |
| Two players on one stall screen | Atomic screen lock |
| Changing the prize or chance of winning | Prize drawn and stored on the server with a secure random number. No outcome accepted from the browser. Remaining quantities are never sent to visitors |
| Extra results from refresh or double tap | Idempotency keys, stored results returned |
| Fake winning screenshots | References are random, stored on the server, tied to the opaque user ID and collected once |
| Reading other visitors' data | Every visitor API checks ownership against the session |
| Script injection on the stall screen | Display names are length-limited and escaped |
| Admin account misuse | Built-in login, hashed passwords (scrypt, built into Node.js), lockout after 5 failed attempts, roles per tab, audit log |
| Cross-site requests on admin APIs | Admin cookie SameSite=Strict plus a required custom header (`X-LKDR-Admin: 1`) |
| Fake stall screens | Screen key issued in the admin dashboard, stored as a hash, can be revoked |
| Floods and bots | CloudFront with Shield Standard, API Gateway throttling, per-session and per-user limits. Per-IP limits are generous because venue Wi-Fi shares one IP |
| Secrets in code | All secrets in SSM Parameter Store (encrypted), least-privilege IAM per Lambda |

## 4. Admin roles

| Role | Access |
|---|---|
| Super admin | Everything, including users and settings |
| Games admin | Project A tabs |
| Hunt admin | Project B tabs |
| Prize desk | Project A prize desk, Project B winner collection |
| Viewer | Read-only live views and reports |

## 5. Transport and storage

| Item | Approach |
|---|---|
| Transport | HTTPS only (ACM certificate), HSTS, TLS 1.2 or later |
| Storage | DynamoDB and S3 encrypted at rest, point-in-time recovery on all tables |
| Browser headers | Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame-ancestors none |
| Data retention | Scan records expire after 30 days (TTL). Plays and results kept for the agreed period (open question) |
