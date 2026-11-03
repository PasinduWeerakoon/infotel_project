# Repository Structure

Backend and frontend are separate, and every project stands on its own (decision D-15): its own `package.json`,
README, tests and AWS deployment. There is no monorepo tooling. Project A and Project B never import each other's code.
The source code is in [apps/](../apps/README.md).

```text
apps/
  backend/
    platform-api/          Shared: QuickLook sign in, scan event webhook, admin login and users, logos and uploads
    games-event-api/       Project A: Spin the Wheel and Lucky Dip
    treasure-hunt-api/     Project B: Treasure Hunt
    quicklook-mock/        Local stand-in for QuickLook (never deployed)
    docker-compose.yml     DynamoDB Local
  frontend/
    games-web/             Project A visitor app
    hunt-web/              Project B visitor app
    screen-web/            Venue screens (stall screen, leaderboard)
    admin-web/             LKDR Admin Dashboard (both projects)
    web-infra/             Hosting for the four web apps
```

Inside each backend service:

```text
src/
  config.ts       settings, secrets from SSM cached in memory
  lib/            HTTP router, Lambda adapter, cookies and roles, logger, time
  domain/         business rules as pure functions (unit tested)
  data/           DynamoDB access
  services/       use cases that combine rules and data
  routes/         HTTP routes, one file per area
  handlers/       Lambda entry points
  local/          local development server (not deployed)
infra/            CDK stack
scripts/          local table setup and demo data
test/             unit tests
```

Inside each web app: `api/` (typed API calls), `components/` (reusable pieces), `features/` or `pages/` (screens),
`hooks/`, `lib/`, `app/` (router, and theme for admin).

## Rules

| Rule | Why |
|---|---|
| Business rules live in `src/domain/` as pure functions | Easy to unit test, no AWS calls |
| Handlers and routes stay thin: validate input, call the service, return the result | Clear and consistent |
| `lib/` files (router, auth, time, logger) are copied into each service, unchanged | Services stay independent without a shared package |
| Every input is validated with Zod on the server | The browser is never trusted |
| Files stay under 400 lines, with comments where the reason is not obvious | Easy to read and review |
| Each project deploys only its own stack | Projects release independently |

## Tooling

| Tool | Use |
|---|---|
| npm (one lockfile per project) | Dependencies |
| TypeScript (strict) | All code |
| Biome | Lint and format |
| Vitest | Unit tests |
| AWS CDK | Infrastructure, one stack per project |
| tsx | Local development servers |
