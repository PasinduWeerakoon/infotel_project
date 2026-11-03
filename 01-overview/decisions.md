# Design Decisions

Each decision has an ID so that code, tickets and other documents can refer to it.

| ID | Decision | Why | Consequence |
|---|---|---|---|
| D-01 | **Two separate projects:** Project A (LKDR Games Event: Spin the Wheel and Lucky Dip) and Project B (Treasure Hunt) | They are separate events with different rules, sessions and prizes | Separate backend services, DynamoDB tables, API paths and AWS stacks. Each can be deployed on its own |
| D-02 | **Spin the Wheel and Lucky Dip are one event** in Project A | They share sessions, the stall screen and the one-play rule | One service, one prize catalogue, sessions shared by both games |
| D-03 | **One LKDR Admin Dashboard** for both projects | Same client, same staff, one URL and login on event day | One frontend app with a tab group per project. Each tab calls its own project's admin API |
| D-04 | **QuickLook login (OpenID Connect)** for visitors | Real visitor identity without our own login, SMS or phone number | Replaces the phone number step (Project A) and the no sign-up approach (Project B) |
| D-05 | **No visitor personal data on our side** | QuickLook owns the user data and does not want it copied | We store only QuickLook's opaque per-application user ID. Names come from the ID token (session only) or the lookup API (shown, not stored) |
| D-06 | **No stored tokens.** A short signed session cookie and silent re-login (`prompt=none`) | Nothing sensitive to protect at rest, simpler | Expired sessions re-authenticate with QuickLook automatically |
| D-07 | **QuickLook scan event webhook is the authoritative record of a scan** | Server-to-server data cannot be faked from a browser | Treasure Hunt points come only from webhook events. Project A entries need a webhook scan |
| D-08 | **EventBridge routes scan events** (the Treasure Hunt part is replaced by D-18) | Decouples the shared scan intake from each project, absorbs bursts | Scan intake does not depend on project code. Scoring retries safely |
| D-09 | **One play per visitor per session across both games** | Client rule | Enforced with a conditional write on session plus user, not per game |
| D-10 | **Weighted random prize draw by remaining quantity** | Client rule: prizes divided by availability and at random | Each prize's chance equals its share of what is left. Totals never exceed the allocation |
| D-11 | **Admin-defined sessions with prize allocation and an auto-split helper** | Admins need to run, for example, 9:00 to 13:00 sessions with their own prizes | Session and allocation screens in the admin dashboard. Sessions open and close by the clock, with staff overrides |
| D-12 | **One player at a time per stall screen (atomic lock), no queue** | Client rule from the earlier requirement | Other visitors see "Game in progress" and scan again later |
| D-13 | **Built-in admin login with roles** (no Cognito) | Lower cost, few users | Hashed passwords in DynamoDB, signed admin session, lockout, roles per tab |
| D-14 | **No AWS WAF, no Secrets Manager** | Cost decision | CloudFront with Shield Standard, API Gateway throttling and per-session rate limits. Secrets in SSM Parameter Store |
| D-15 | **Separate projects, backend and frontend apart (no monorepo tooling)** | Clear ownership, simple tooling, each project released on its own | Small shared helpers are copied into each service on purpose. See [repository structure](../07-delivery/repository-structure.md) |
| D-16 | **Automated tests only** (unit, API, concurrency, simulation) | Agreed approach | See [testing](../07-delivery/testing.md) |
| D-17 | **Both games ask for a name and phone number** (changes D-05 for Spin the Wheel and Lucky Dip, as the project document asks for phone entry before playing) | The prize desk finds winners by name, and the screens show who won | Typed by the player before playing, not validated, stored on the entry and the prize reference. The screens show the name and the phone with its middle digits hidden. Not written to logs. Treasure Hunt still stores no personal data |
| D-18 | **QuickLook counts Treasure Hunt scans; we read its Leaderboard API** | QuickLook already counts signed-in logo scans and ranks visitors, and provided a Leaderboard API | The admin selects the event's QuickLook logos per session (reusable for later sessions). The hunt reads the export every 15 seconds while a session runs, stores standings and winners, and reads once more at the end. No scan queue or scoring worker. The API address and key are per environment in SSM, backend only. Staff see names and mobile numbers, the public screen shows player numbers |
