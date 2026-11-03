# Delivery Plan

## 1. Dates

| Milestone | Date | Note |
|---|---|---|
| Design review (this folder) | Tue 27 Oct 2026 | Review with Madushan, share the QuickLook contract with Dilshan A and Dilshan W |
| API target | Before 28 Oct 2026 (as agreed in the estimate) | At risk. This design adds the scan webhook, QuickLook login and admin-defined sessions. Re-confirm after the design review |
| Release | Mon 02 Nov 2026 | All applications |

## 2. Build order

| Step | Work | Depends on |
|---|---|---|
| 1 | Repository, CDK stacks, pipeline, `dev` environment | AWS account access |
| 2 | Shared platform: scan intake (webhook), auth (OIDC), admin auth | QuickLook test endpoints (mock until ready) |
| 3 | Project A domain: sessions, allocation, auto-split, weighted draw (pure functions with tests) | None |
| 4 | Project A APIs: entries, play, screen WebSocket, admin APIs | Steps 2 and 3 |
| 5 | Project B domain and APIs: scoring worker, visitor and admin APIs | Step 2 |
| 6 | Frontends: games-web, hunt-web, screen-web | Steps 4 and 5 |
| 7 | LKDR Admin Dashboard | Steps 4 and 5 |
| 8 | End-to-end with QuickLook test environment, automated tests, go-live checklist | All |

## 3. Working with mocks

Until QuickLook's test environment is ready:
- A local mock issues ID tokens with the agreed claims and signs scan events with the test secret from the [worked example](../06-quicklook-integration/sample-payloads/scan-event-signature.md).
- Switching to the real QuickLook needs configuration only (SSM parameters), no code changes.

## 4. Split of work (proposal)

| Person | Area |
|---|---|
| Pasindu | Shared platform, Project A backend, QuickLook integration |
| Madushan | Project B backend, frontends, LKDR Admin Dashboard |

To be confirmed between Pasindu and Madushan.
