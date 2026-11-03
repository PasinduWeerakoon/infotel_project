# LKDR Admin Dashboard

One app for both events and the prize desk, with Ant Design and the LKDR theme (`src/app/theme.ts`).
What each person sees depends on their role (`src/app/navigation.tsx`); the APIs check roles again.

| Area | Pages |
|---|---|
| Overview | Live Games Event (pause games, end session, prizes left, latest plays) and Treasure Hunt top 10 |
| Games Event | Sessions, prize catalogue, allocation with auto-split, logos and stall screens, plays and CSV, game rules |
| Treasure Hunt | Sessions with prizes per rank, stalls (also registers their QuickLook logos), leaderboard and winners |
| Prize desk | Find a Games prize by reference or a hunt winner by player number, show the QuickLook name (not stored), collect once |
| Admin | Users and roles |

Structure: `api/` typed clients per backend, `app/` theme, auth, navigation and router, `components/` shared pieces,
`hooks/useAction.ts` (every save shows a message and refreshes data), `pages/` one file per page.

`npm run dev` (port 5175), `npm run build`, `npm run lint`. Set `VITE_SCREEN_WEB_URL` for stall screen links. Hosting: `../web-infra`.
