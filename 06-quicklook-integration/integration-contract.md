# QuickLook Integration Contract

Version 1.0 (draft for agreement), 27 Oct 2026
Our side: Pasindu, Madushan. QuickLook side: Dilshan A, Dilshan W.

This document is what both teams build against. Items marked **To agree** need a decision from QuickLook.

## 1. Overview

| Part | Direction | Purpose |
|---|---|---|
| A. Logo links | QuickLook to visitor browser | Open our page for the scanned logo, with the scan ID |
| B. Scan event webhook | QuickLook server to our API | Authoritative record of every scan |
| C. Sign-in (OpenID Connect) | Visitor browser and our Auth service with QuickLook | Visitor identity (opaque user ID, display name) |
| D. Name lookup API | Our Admin API to QuickLook | Winner display name at the prize desk (not stored) |

## 2. A. Logo links

Each logo is registered in QuickLook with a target URL. QuickLook appends the scan ID when it opens the link.

| Logo type | Target URL |
|---|---|
| Spin the Wheel | `https://games.<domain>/s/{scan_id}` |
| Lucky Dip | `https://games.<domain>/s/{scan_id}` |
| Treasure Hunt stall | `https://hunt.<domain>/s/{scan_id}` |

- The URL carries only the scan ID. It grants nothing on its own. Our server accepts it only if the matching scan event (part B) exists and belongs to the signed-in visitor.
- **To agree:** the logo IDs for the two game logos and every participating stall, and the domain names.

### A2. Partner link for the two games (in use, decision D-19)

QuickLook opens the game logo with the signed-in user, encrypted:

| Logo | Link |
|---|---|
| Spin the Wheel | `https://games.<domain>/q/logo_game_spin?qUser=<hex>` |
| Lucky Dip | `https://games.<domain>/q/logo_game_dip?qUser=<hex>` |

- `qUser` = hex of IV (12 bytes), AES-256-GCM ciphertext, auth tag (16 bytes). The key is 32 bytes, kept in SSM on our side (`/lkdr/{stage}/quicklook/partner-link-key`) and used only by the platform API.
- Plaintext today: `{"user_id":"…","first_name":"…","last_name":"…"}`. We sign the visitor in with `user_id` (the same ID as the Leaderboard API) and use the full name. The visitor plays with no popup. After a win the result page asks only for the phone number, for the prize desk, and shows the reference once it is given (`POST /games/v1/entries/{entryId}/phone`).
- No `qUser` means the visitor is not signed in to the QuickLook app. They can still play the two games as a guest: they type their name and phone number, and the phone number is their identity (one play per number per session, `POST /auth/v1/guest-login`). The Treasure Hunt needs the QuickLook app.
- **To agree:** QuickLook adds `iat` (issue time, Unix seconds) so links expire after 5 minutes, and `logo_id` so a link works only for its game. We already check both when present.

## 3. B. Scan event webhook

### Endpoint
`POST https://api.<domain>/integrations/quicklook/v1/scan-events`

### Headers
| Header | Example | Rule |
|---|---|---|
| `Content-Type` | `application/json` | Required |
| `X-QL-Event-Id` | `evt_01HF8Z3K2N` | Unique per event |
| `X-QL-Timestamp` | `1793594645` | Unix seconds. Rejected if more than 300 seconds from our clock |
| `X-QL-Signature` | `v1=5f2b...e9` | HMAC-SHA256 (see below) |

### Signature
```text
signed_payload = X-QL-Timestamp + "." + raw_request_body
signature      = hex( HMAC_SHA256( shared_secret, signed_payload ) )
header value   = "v1=" + signature
```
- The shared secret is exchanged once, outside email, and stored in SSM Parameter Store on our side.
- We compare signatures in constant time. Two secrets can be active at once during rotation.

### Body
```json
{
  "eventId": "evt_01HF8Z3K2N",
  "eventType": "logo.scanned",
  "occurredAt": "2026-11-02T10:14:05+05:30",
  "scan": { "scanId": "qls_01HF8Z3K2M", "logoId": "logo_game_spin" },
  "user": { "sub": "ql_pw_8f3a2c91" }
}
```

| Field | Rule |
|---|---|
| `scan.scanId` | Unique per scan. The same value is used in the logo link (part A) |
| `scan.logoId` | One of the agreed logo IDs |
| `user.sub` | The **pairwise** (per-application) user ID, the same value as `sub` in the ID token. No names, phone numbers or emails |
| `occurredAt` | Scan time with offset |

### Responses
| Code | Meaning | QuickLook action |
|---|---|---|
| 202 | Accepted (stored, or a duplicate we already have) | Done |
| 400 | Invalid body | Do not retry. Fix the payload |
| 401 | Bad signature or timestamp | Do not retry. Check the secret and clock |
| 429, 5xx, timeout | Temporary problem | Retry |

### Delivery rules
- Timeout: 5 seconds.
- Retries: after 1 s, 5 s, 30 s, 2 min and 10 min (5 attempts).
- At least once delivery. We de-duplicate by `scanId`.
- Order is not guaranteed.
- **To agree:** QuickLook should send the event **before** opening the logo link, so that it usually arrives first. Our pages wait up to 3 seconds if it has not arrived yet.

## 4. C. Sign-in (OpenID Connect)

| Item | Value |
|---|---|
| Flow | Authorization code (with PKCE) |
| Scopes | `openid profile` |
| Redirect URIs (registered) | `https://games.<domain>/auth/v1/callback`, `https://hunt.<domain>/auth/v1/callback` |
| `state` | Random, contains the return page (for example `/s/qls_01HF8Z3K2M`) |
| `nonce` | Random, checked in the ID token |
| Silent re-login | `prompt=none` when the visitor is already signed in to QuickLook |
| Subject (`sub`) | **Pairwise** per client (our app gets an ID that is useless elsewhere) |
| Name claim | `given_name` (first name is enough) |
| Token verification | QuickLook JWKS URL, issuer, audience (our client ID), expiry |

We do not store access or refresh tokens. We keep a short signed session cookie and re-authenticate silently when it expires.

**To agree:** authorization, token and JWKS endpoint URLs, client IDs and secrets per app, token lifetimes, and how QuickLook opens links (phone browser or in-app browser).

## 5. D. Name lookup API (provided by QuickLook)

Used only at the prize desk to show one winner's name. The result is never stored.

```http
GET https://<quicklook>/api/v1/users/{sub}/display-name
Authorization: Bearer <client credentials access token>
```
```json
{ "sub": "ql_pw_8f3a2c91", "displayName": "Nimal" }
```

**To agree:** URL, authentication (OAuth 2.0 client credentials), rate limit.

## 6. Test plan

| Step | Owner |
|---|---|
| QuickLook test environment, test accounts and test logos | QuickLook |
| Our development webhook URL and callback URLs registered in QuickLook | Both |
| Signature test with the sample payload in `sample-payloads/` | Both |
| End to end: scan, webhook, login, play, result | Both |
| Retry and duplicate delivery test | Both |

## 7. Samples

| File | Contents |
|---|---|
| [scan-event.json](sample-payloads/scan-event.json) | Webhook body |
| [scan-event-signature.md](sample-payloads/scan-event-signature.md) | Worked signature example |
| [id-token-claims.json](sample-payloads/id-token-claims.json) | Expected ID token claims |
| [name-lookup-response.json](sample-payloads/name-lookup-response.json) | Lookup API response |

## E. Treasure Hunt scans (QuickLook backend to our API, decision D-20)

QuickLook's backend calls our API once for every stall logo scan, straight away.

### Endpoint
`POST https://api.<domain>/integrations/quicklook/v1/hunt-scans`

```json
{ "data": "<hex>" }
```

### Encryption
- `data` = hex of IV (12 random bytes), AES-256-GCM ciphertext, auth tag (16 bytes). The same format as the game links (part A2).
- The key is 32 bytes (64 hex characters), one per environment, generated by us and shared with QuickLook outside email. It is kept in SSM on our side (`/lkdr/{stage}/hunt/scan-key`).
- A message we cannot open (wrong key or changed) is answered `400 MESSAGE_INVALID`. Do not send it again.

### Plaintext (JSON)
| Field | Example | Needed | Meaning |
|---|---|---|---|
| `logo_id` | `0b6f2a10-1c1e-4a61-9a01-000000000001` | Yes | The scanned logo. QuickLook sends only the logos allocated to the Treasure Hunt, and each one counts |
| `user_id` | `edef31a4-8dfb-4e60-81ea-dc7168aead6a` | Yes | The QuickLook user, the same ID as in the game links |
| `user_name` | `Dilshan Amarasinghe` | Yes | Shown to staff only |
| `scanned_at` | `2026-11-03T10:14:05+05:30` | Agreed to add | Scan time (ISO, or Unix seconds). Older than 5 minutes is refused (`400 MESSAGE_EXPIRED`), so a copied request cannot count again later |
| `event_id` | `evt_01HF8Z3K2N` | Agreed to add | Unique per scan. A scan resent with the same ID is stored once |

### Answers
| HTTP | Body | Meaning |
|---|---|---|
| 200 | `{"received":true,"result":"counted"}` | Stored and counted (`repeat`, `no-session` and `already-received` are also 200: stored, not counted) |
| 400 | `{"error":{"code":"MESSAGE_INVALID"}}` or `MESSAGE_EXPIRED` | Not stored. Do not resend |
| 503 | `{"error":{"code":"NOT_READY"}}` | The key is not set up for this environment yet. Resend later |
| 5xx | | Our side failed. Resend with the same `event_id` |

### Logos
There is no logo list. QuickLook sends scans of the logos allocated to the Treasure Hunt only, so every `logo_id` it sends counts (agreed 4 Nov 2026).

