# System Overview

## 1. Purpose

LK Domain Registry (LKDR) runs two engagement events at its INFOTEL 2026 stall and across the exhibition. Visitors take part from their own phones through QuickLook (ql.lk). LKDR staff run both events from one admin dashboard.

## 2. Scope (Version 1)

| In scope | Notes |
|---|---|
| Project A: LKDR Games Event | Spin the Wheel and Lucky Dip as one event with shared sessions and prizes |
| Project B: Treasure Hunt | Exhibition-wide stall scanning with points and a live leaderboard |
| LKDR Admin Dashboard | One app, one login, tabs per project, role-based access |
| QuickLook integration | Visitor sign-in (OpenID Connect) and a scan event webhook |
| Venue screens | Stall screen for Project A, leaderboard screen for Project B |
| AWS serverless hosting | Lambda, API Gateway, DynamoDB, S3, CloudFront, EventBridge, SQS |

Not covered here: the Exhibitor Portal, the TechBazar Offer Portal and the mypage.lk Live Leaderboard. They have their own documents.

## 3. Actors

| Actor | What they do |
|---|---|
| Visitor | Scans a game or stall logo in QuickLook, signs in once, plays or collects points |
| Stall screen | Shows the current player, the spin or draw animation and the result for Project A |
| Leaderboard screen | Shows the live Treasure Hunt leaderboard and countdown |
| LKDR staff (prize desk) | Checks winning references and hands over prizes |
| LKDR admins | Define sessions, allocate prizes, manage stalls, confirm winners, export results |
| QuickLook | Signs visitors in, recognises logos, sends scan events to our API |

## 4. How the two events work

### Project A: LKDR Games Event (Spin the Wheel and Lucky Dip)
1. The visitor scans the Spin the Wheel or Lucky Dip logo at the LKDR stall and signs in with QuickLook.
2. QuickLook sends us the scan event. The visitor's phone opens our game page.
3. The server checks the session is open, the visitor has **not played in this session yet (either game)**, and nobody else is playing on the stall screen.
4. The visitor taps Play. The server draws a prize at random, weighted by how many of each prize are left in the session.
5. The stall screen and the phone show the same animation and result. The phone shows the winning reference on a separate result page.
6. The visitor shows the reference at the prize desk, and staff mark it as collected.

### Project B: Treasure Hunt
1. Admins define a session (for example 10:00 to 12:00) and the participating stalls.
2. Visitors scan stall logos with QuickLook during the session.
3. QuickLook's scan event (server to server) adds points: once per stall, per visitor, per session.
4. The phone shows the result for each scan, the visitor's score and rank, and a link to the stall's offerings.
5. When the session ends, standings freeze. Staff confirm the winners in the admin dashboard.

## 5. Key rules at a glance

| Rule | Project |
|---|---|
| Sessions are defined by admins (date, start, end) and do not overlap | A and B |
| Prizes are allocated to each session by admins, with an auto-split helper | A |
| One play per visitor per session, across both Spin the Wheel and Lucky Dip | A |
| One player at a time across both games (Spin the Wheel and Lucky Dip), no queue | A |
| Prize draw is random, weighted by the remaining quantity of each prize | A |
| Points only from QuickLook's server-to-server scan events | B |
| One point award per stall, per visitor, per session | B |
| No visitor personal data stored on our side, only an opaque QuickLook ID | A and B |

Full rules: [Project A rules](../03-lkdr-games-event/rules-sessions-and-prizes.md), [Project B rules](../04-treasure-hunt/rules-sessions-and-prizes.md).

## 6. Glossary

| Term | Meaning |
|---|---|
| Session | A time window (for example 9:00 to 13:00) in which an event runs. Each project has its own sessions |
| Allocation | The number of each prize assigned to a session (and game) |
| Entry | A visitor's permission to play once, created after a valid scan |
| Play | The single prize draw for an entry |
| Reference | The unique winning code shown on the visitor's phone, for example LKDR-SW-7K3Q9X |
| Scan event | QuickLook's server-to-server message that a logo was scanned |
| Opaque user ID | QuickLook's anonymous, per-application user ID (pairwise `sub`). We store only this |
| Play lock | The single record that allows one player at a time across both games |
| Stall | A participating exhibitor stall in the Treasure Hunt, linked to one QuickLook logo |
