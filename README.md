# LKDR Games Platform: Design and Documentation

Version 1.0 (draft for review), 27 Oct 2026

This folder holds the technical design for the LK Domain Registry (LKDR) games at INFOTEL 2026:

| Project | What it is | Event |
|---|---|---|
| **Project A: LKDR Games Event** | Spin the Wheel and Lucky Dip, played on the visitor's phone and shown on the stall screen | One event, shared sessions and prizes |
| **Project B: Treasure Hunt** | Visitors scan stall logos across the exhibition to collect points | A separate event with its own sessions |
| **LKDR Admin Dashboard** | One admin app with a tab group for each project | Used by LKDR staff for both events |

Both projects use **QuickLook (ql.lk)** for visitor sign-in and scanning. QuickLook also calls our API on every scan (scan event webhook). No visitor personal data is stored on our side.

> This folder is the technical source of truth for these three items. It replaces the technical parts of the earlier client documents for Spin the Wheel and Lucky Dip (04) and Treasure Hunt (05). The phone number and no sign-up approaches described there are replaced by QuickLook login.

## How to read this folder

Start with the overview, then the architecture, then the project you are working on.

| Folder | Contents | Read it when |
|---|---|---|
| [01-overview](01-overview/) | [System overview](01-overview/system-overview.md), [design decisions](01-overview/decisions.md) | First, to understand the scope and the main choices |
| [02-architecture](02-architecture/) | [Architecture](02-architecture/architecture.md), [frontend](02-architecture/frontend.md), [backend](02-architecture/backend.md), [security](02-architecture/security.md), [scalability](02-architecture/scalability.md), [diagrams](02-architecture/diagrams/) | Before designing or building any part |
| [03-lkdr-games-event](03-lkdr-games-event/) | Project A: [overview](03-lkdr-games-event/README.md), [rules, sessions and prizes](03-lkdr-games-event/rules-sessions-and-prizes.md), [data model](03-lkdr-games-event/data-model.md), [API plan](03-lkdr-games-event/api-plan.md), [OpenAPI](03-lkdr-games-event/openapi.yaml) | Working on Spin the Wheel or Lucky Dip |
| [04-treasure-hunt](04-treasure-hunt/) | Project B: [overview](04-treasure-hunt/README.md), [rules, sessions and prizes](04-treasure-hunt/rules-sessions-and-prizes.md), [data model](04-treasure-hunt/data-model.md), [API plan](04-treasure-hunt/api-plan.md), [OpenAPI](04-treasure-hunt/openapi.yaml) | Working on Treasure Hunt |
| [05-admin-dashboard](05-admin-dashboard/) | [Admin dashboard](05-admin-dashboard/README.md): tabs, screens, roles | Working on the admin app |
| [06-quicklook-integration](06-quicklook-integration/) | [Integration contract](06-quicklook-integration/integration-contract.md), [sample payloads](06-quicklook-integration/sample-payloads/) | Agreeing or building the QuickLook connection |
| [07-delivery](07-delivery/) | [Repository structure](07-delivery/repository-structure.md), [environments and deployment](07-delivery/environments-and-deployment.md), [testing](07-delivery/testing.md), [plan](07-delivery/plan.md), [open questions](07-delivery/open-questions.md), [AWS cost estimate](07-delivery/aws-cost-estimate.md) | Setting up the code, pipeline and releases |
| [08-wireframes](08-wireframes/) | [Wireframes index and canvas link](08-wireframes/README.md) | Designing the screens of all three applications |

## Diagrams

| Diagram | File |
|---|---|
| High-level flow (start here) | [00-high-level-flow.png](02-architecture/diagrams/00-high-level-flow.png) |
| Component architecture with numbered flows | [01-component-architecture.png](02-architecture/diagrams/01-component-architecture.png) |
| Project A play sequence | [02-games-event-play-sequence.png](02-architecture/diagrams/02-games-event-play-sequence.png) |
| Project B scan and scoring sequence | [03-treasure-hunt-scan-sequence.png](02-architecture/diagrams/03-treasure-hunt-scan-sequence.png) |

Each PNG has an editable SVG next to it.

## People

| Side | People | Responsible for |
|---|---|---|
| Our side (AWS) | Pasindu, Madushan | Backend, frontend, admin dashboard, infrastructure |
| QuickLook | Dilshan A, Dilshan W | QuickLook sign-in, scan event webhook, logo links |
| Client | LK Domain Registry (LKDR) | Rules, sessions, prizes, stall list, approvals |

## Key dates

| Milestone | Date |
|---|---|
| Release (all applications) | Mon 02 Nov 2026 |
| API target | Before 28 Oct 2026, as agreed in the estimate (see [plan](07-delivery/plan.md)) |
