# LKDR Games and Treasure Hunt: source code

Code for the design in [../README.md](../README.md). Backend and frontend are separate projects.
Each project has its own `package.json`, README, tests and AWS deployment, and can be released on its own.

```text
apps/
  backend/
    platform-api/        Shared: QuickLook sign in, scan event webhook, admin login and users, logos and uploads
    games-event-api/     Project A: Spin the Wheel and Lucky Dip (sessions, prizes, weighted draw, stall screens)
    treasure-hunt-api/   Project B: Treasure Hunt (reads QuickLook's leaderboard, winners)
    quicklook-mock/      Local stand-in for QuickLook (sign in, a "scan a logo" simulator and the Leaderboard API). Never deployed
    docker-compose.yml   DynamoDB Local for development
  frontend/
    games-web/           Visitor app for Spin the Wheel and Lucky Dip (phone)
    hunt-web/            Visitor app for the Treasure Hunt (phone)
    screen-web/          Venue screens: stall screen and leaderboard screen (TV)
    admin-web/           LKDR Admin Dashboard (laptop)
    web-infra/           Hosting for the four web apps (S3 and CloudFront)
```

## Technology

| Layer | Choice |
|---|---|
| Visitor and screen apps | React 19, TypeScript, Vite, Tailwind CSS v4, React Router 7, TanStack Query, Tabler icons |
| Admin dashboard | React 19, Ant Design 5 with the LKDR theme (Geist, zinc neutrals, LKDR blue) |
| APIs | AWS Lambda (Node.js 22, TypeScript, ARM64), API Gateway HTTP and WebSocket APIs, Zod validation |
| Data and events | DynamoDB on-demand (one table per project), EventBridge for scan events |
| Infrastructure | AWS CDK, one stack per project |
| Quality | Biome (lint and format), Vitest (unit tests) |

## Run everything on your computer

You need Node.js 20 or newer and Docker.

1. Start the local database (port 8100):
   ```bash
   cd apps/backend && docker compose up -d
   ```
2. In each backend project, install, copy the settings and create the tables with demo data:
   ```bash
   cd apps/backend/platform-api && npm install && cp .env.example .env && npm run db:setup
   cd ../games-event-api && npm install && cp .env.example .env && npm run db:setup
   cd ../treasure-hunt-api && npm install && cp .env.example .env && npm run db:setup
   cd ../quicklook-mock && npm install
   ```
3. Start the four backend servers, each in its own terminal, with `npm run dev`.
4. Start the four web apps, each in its own terminal, with `npm install` then `npm run dev`.

| What | Address |
|---|---|
| QuickLook app simulator (start here) | http://localhost:4010 |
| Games app (phone) | http://localhost:5173 |
| Treasure Hunt app (phone) | http://localhost:5174 |
| Admin dashboard | http://localhost:5175 (user `super.admin`, password from `BOOTSTRAP_ADMIN_PASSWORD` in platform-api/.env) |
| Stall screen, Spin the Wheel | http://localhost:5176/stall?key=scr_local_spin |
| Stall screen, Lucky Dip | http://localhost:5176/stall?key=scr_local_dip |
| Leaderboard screen | http://localhost:5176/leaderboard |
| APIs | platform 4000, games 4001, hunt 4002 |

### Try it

1. Open the stall screen for Spin the Wheel in one window.
2. Open the QuickLook simulator, pick a test visitor and tap **Scan this logo** on Spin the Wheel.
3. The games app opens, signs in through the mock QuickLook, and the stall screen shows "Get ready".
4. Tap **Spin now**. The phone and the stall screen spin and land on the same prize.
5. Find the reference at the prize desk in the admin dashboard and mark it collected.
6. Treasure Hunt: in the simulator's **Treasure Hunt logos** section, tap **Scan** on a few logos. QuickLook (the mock)
   counts them and the hunt reads them every 5 seconds locally. Open the Treasure Hunt app (`/me`, it signs you in as the
   same test visitor) and the leaderboard screen. Admins choose the logos per session in Treasure Hunt, Sessions, **Choose**.

Demo data: sessions run from 00:00 to 12:00 and 12:00 to 23:59 today and tomorrow, so the apps work at any time.
Each test visitor can play once per session. Pick another visitor to play again.

## Checks

Run in any project:

```bash
npm run typecheck
npm run lint
npm test
```

## Deploy to AWS

Order: platform, then games and hunt (they add routes to the platform's HTTP API), then the web apps.

1. Create the secrets once in SSM Parameter Store (SecureString), under `/lkdr/{stage}/`:
   `platform/session-secret`, `platform/admin-secret`, `quicklook/client-secret`, `quicklook/webhook-secrets`.
2. Deploy the backend:
   ```bash
   cd apps/backend/platform-api && npx cdk deploy -c stage=dev -c domain=example.lk
   cd ../games-event-api && npx cdk deploy -c stage=dev
   cd ../treasure-hunt-api && npx cdk deploy -c stage=dev
   ```
3. Build and deploy the web apps (set `VITE_SCREENS_WS_URL` for screen-web from the games stack output):
   ```bash
   cd apps/frontend/games-web && npm run build
   cd ../web-infra && npx cdk deploy lkdr-dev-web-games -c stage=dev
   ```
4. On event days, deploy with `-c provisioned=20` to keep the busy Lambdas warm.

Details: [07-delivery/environments-and-deployment.md](../07-delivery/environments-and-deployment.md).
