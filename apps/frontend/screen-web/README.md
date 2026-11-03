# Screen web (venue TVs)

| Route | Screen |
|---|---|
| `/stall?key=...` | Stall screen for Spin the Wheel or Lucky Dip. Live over WebSocket: logos, reserved, the same animation as the phone, the prize. Reconnects on its own |
| `/leaderboard` | Treasure Hunt leaderboard, refreshed every 3 seconds, winners after the end |

The screen link with its key is created in the admin dashboard (Logos and screens). Screens never show names or references.
For AWS builds set `VITE_SCREENS_WS_URL` to the games stack's WebSocket URL.

`npm run dev` (port 5176), `npm run build`, `npm run lint`. Hosting: `../web-infra`.
