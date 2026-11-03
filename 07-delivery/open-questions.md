# Open Questions

## QuickLook (Dilshan A, Dilshan W)

| ID | Question |
|---|---|
| Q-QL-01 | OpenID Connect endpoints (authorization, token, JWKS), client IDs and secrets per app |
| Q-QL-02 | Pairwise (per-application) `sub` supported? |
| Q-QL-03 | `given_name` in the ID token? |
| Q-QL-04 | Silent re-login with `prompt=none` supported? Token lifetimes? |
| Q-QL-05 | Scan event webhook: can it be sent before the logo link opens? Retry policy as proposed? |
| Q-QL-06 | Logo IDs for the two game logos and all stalls, and logo link format with `{scan_id}` |
| Q-QL-07 | Name lookup API: URL, authentication, rate limit |
| Q-QL-08 | Phone browser or in-app browser when a logo link opens? |
| Q-QL-09 | Test environment, test accounts and test logos: when available? |
| Q-QL-10 | Expected peak sign-ins and scans per second on QuickLook's side |

## LKDR (client)

| ID | Question |
|---|---|
| Q-LK-01 | Event dates, opening hours and the sessions per day for Project A and Project B |
| Q-LK-02 | Prize catalogue and stock per prize. Plays per game per day: 100 or 140? |
| Q-LK-03 | Separate allocations for Spin the Wheel and Lucky Dip, or one shared pool? (Design supports per game) |
| Q-LK-04 | Unused prizes at session end: expire or roll over to the next session? |
| Q-LK-05 | Pacing on or off? |
| Q-LK-06 | Repeat-winner rule (one main prize per visitor per day) on or off, and shown as a game rule? |
| Q-LK-07 | Treasure Hunt: points per stall (10?), winners per session, prizes per rank, can previous winners win again? |
| Q-LK-08 | Number of participating stalls, and who prints and places the logo stands |
| Q-LK-09 | One stall screen for both games or one per game? |
| Q-LK-10 | Admin users and roles needed on event day |
| Q-LK-11 | Data retention period for plays and results after the event |

## Internal (Pasindu, Madushan)

| ID | Question |
|---|---|
| Q-IN-01 | AWS account and domain names (games, hunt, screens, admin, api) |
| Q-IN-02 | Admin UI component library |
| Q-IN-03 | Confirm the split of work and the revised API target date |
