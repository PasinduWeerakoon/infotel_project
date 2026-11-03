# QuickLook mock (local only)

Stands in for QuickLook so everything can be built and tested before QuickLook's test environment is ready.
Follows the [integration contract](../../../06-quicklook-integration/integration-contract.md).

- OpenID Connect provider: discovery, authorize (with `prompt=none`), token, JWKS. Signing key kept in `.local/`.
- Name lookup API for the prize desk (client credentials).
- App simulator at http://localhost:4010: pick a test visitor, tap a logo. The mock sends the signed scan event to
  the platform API, then opens the logo link like the real app. Tick "send late" to test events that arrive after the page.

`npm install && npm run dev`. Switching to the real QuickLook needs settings only (platform-api `.env` or SSM), no code changes.
