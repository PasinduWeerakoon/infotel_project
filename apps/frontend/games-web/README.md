# Games web (Project A visitor app)

Spin the Wheel and Lucky Dip on the visitor's phone. Opened only from a QuickLook logo link.

| Route | Page |
|---|---|
| `/s/:scanId` | Creates the entry on the server, then replaces the address (the link cannot be reused) |
| `/play/:entryId` | Ready, then the game. The wheel starts on tap while the server draws the prize |
| `/result/:entryId` | Prize and reference ID (phone only), or "collected", or "not this time" |
| `/status/:code` | Every warning and error (already played, other game, closed, in progress, timed out, scan again) |

Smooth by design: next pages prefetched, View Transitions between pages, transform-only animations
(`features/game/useWheelSpin.ts`), confetti and vibration on a win, about 120 KB of JavaScript (gzipped) on first load.

`npm run dev` (port 5173, APIs proxied), `npm run build`, `npm test`, `npm run lint`. Hosting: `../web-infra`.
