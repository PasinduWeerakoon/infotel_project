# Platform API

Shared by both events. Owns the shared HTTP API, the `platform` table, the event bus and the image storage.

| Area | Routes |
|---|---|
| Visitor sign in (QuickLook OpenID Connect) | `GET /auth/v1/login`, `GET /auth/v1/callback`, `GET /auth/v1/session`, `POST /auth/v1/logout` |
| QuickLook scan webhook | `POST /integrations/quicklook/v1/scan-events` (HMAC signature, 5 minute window, stored once) |
| Admin sign in and users | `/admin/v1/auth/*`, `/admin/v1/users` |
| Logos and uploads | `GET /platform/v1/logos` (public), `/admin/v1/logos`, `POST /admin/v1/uploads` |
| Prize desk name lookup | `GET /admin/v1/quicklook/users/:userId/name` (shown, never stored) |

## Structure

```text
src/
  config.ts        settings, and secrets from SSM cached in memory
  lib/             HTTP router, Lambda adapter, cookies and roles, logger, time (copied into each service)
  domain/          pure rules: webhook signature, password hashing
  data/            DynamoDB access (scans, logos, admins)
  services/        QuickLook client, event publishing, uploads
  routes/          HTTP routes, one file per area
  handlers/        Lambda entry points: auth, scan-intake, admin
  local/           local dev server (not deployed)
infra/             CDK stack
scripts/           local table setup and demo data
test/              unit tests
```

## Scripts

`npm run dev` (port 4000), `npm run db:setup`, `npm test`, `npm run typecheck`, `npm run lint`, `npx cdk deploy -c stage=dev`.
Settings: see `.env.example`.
