# Hunt web (Project B visitor app)

Treasure Hunt on the visitor's phone: scan result (points, rank, player number), progress, leaderboard.
Points are never added by this app. It only shows what the server scored from the QuickLook scan event.

| Route | Page |
|---|---|
| `/s/:scanId` | Scan result. Shows "Counting your scan" while the server is still scoring |
| `/me` | Points, rank, stalls found, time left. After the end: final standing, then the winner card |
| `/leaderboard` | Top 10 by player number |

`npm run dev` (port 5174), `npm run build`, `npm run lint`. Hosting: `../web-infra`.
