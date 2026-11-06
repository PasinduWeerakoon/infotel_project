# Frontend Architecture

## 1. Apps

| App | Path or domain (to be confirmed) | Users |
|---|---|---|
| LKDR Games app | `games.<domain>` | Visitors (Project A) |
| Treasure Hunt app | `hunt.<domain>` | Visitors (Project B) |
| Venue screen app | `screens.<domain>` | Stall screen and leaderboard screen |
| LKDR Admin Dashboard | `admin.<domain>` | LKDR staff and admins |

All four are static single-page apps on S3, served by CloudFront over HTTPS.

## 2. Technology

| Area | Choice |
|---|---|
| Framework | React 18, TypeScript (strict), Vite |
| Routing | React Router |
| Server state | TanStack Query (caching, retries, polling) |
| Validation | Zod on the server for every input. Typed API clients in each app (`src/api`) |
| Animations | Canvas and CSS transforms (wheel engine reused from the in-house Spin and Win prototype) |
| Styling | Visitor and screen apps: Tailwind CSS v4 with LKDR design tokens. Admin: Ant Design 5 with the LKDR theme |

## 3. Private routes (visitor apps)

Pages are shown only when the server confirms the visitor's current step. The server is the real guard, and the routes only reflect it.

### LKDR Games app
| Route | Shown when | Otherwise |
|---|---|---|
| `/s/:scanId` | Entry point from the QuickLook logo link | Starts login if there is no session |
| `/play` | Signed in and an entry exists for this scan | Redirect to `/scan-again` |
| `/game/spin`, `/game/lucky-dip` | Entry status is `ready` for that game | Redirect to the result page or `/scan-again` |
| `/result/:entryId` | Entry status is `played` and belongs to this visitor | Redirect to `/scan-again` |
| `/scan-again` | Always | Explains how to play (scan the logo at the stall) |
| `/closed` | No open session | Shows the next session time |

Rules:
- The scan ID is removed from the address bar after the entry is created (`history.replaceState`).
- After a play, back and refresh always land on the result page.
- "Scan again" links to QuickLook, never directly to the game.

### Treasure Hunt app
| Route | Purpose |
|---|---|
| `/s/:scanId` | Entry point from a stall logo. Shows the scan result (polls up to 3 s while the webhook is processed) |
| `/me` | Score, rank, stalls visited, countdown |
| `/leaderboard` | Top N with QuickLook names |
| `/not-started`, `/ended` | Session states |

## 4. Venue screen app

| Screen | Data | Behaviour |
|---|---|---|
| Stall screen (16:9) | WebSocket from the Screen API | Logos (idle), "Get ready" while reserved, the same animation as the phone, the prize (no name or reference), then idle. Reconnects automatically and restores state |
| Leaderboard screen | `GET /hunt/v1/leaderboard` every 5 s through CloudFront | Top N, countdown, session state. Keeps the last data if offline |

Each screen authenticates with a screen key issued from the admin dashboard.

## 5. LKDR Admin Dashboard

One app with tab groups per project. Screens and roles: [admin dashboard](../05-admin-dashboard/README.md).

## 6. Performance targets

| Target | Value |
|---|---|
| JavaScript on visitor pages | Under 150 KB gzipped |
| Largest Contentful Paint on 4G | Under 2.5 s |
| Animation | 60 fps on mid-range phones, transforms only |
| Offline or weak Wi-Fi | Clear retry states, no blank screens |

## 7. Reusable components

Each app is its own project (no shared package). Inside each app, every screen is built from the same small set
of components: `Screen` (page frame), `Button`, `Card`, `StatusView` (all warnings and errors), `PrizeImage`, `Chip`.
The admin app uses Ant Design components with one theme file and shared `PageHeader`, `SessionPicker`, `ImageUpload`
and `useAction` (save, message, refresh).

## 8. Smooth experience

| Technique | Where | Effect |
|---|---|---|
| Spin starts on tap, before the server answers. The wheel runs a free spin, then eases to the prize segment when the result arrives | Spin the Wheel | No waiting moment. Network time is hidden inside the animation |
| Lucky Dip: nine 3D gift boxes (CSS 3D). The picked box flies forward and spins while the result loads, then the lid opens and the prize rises out. The big screens show the same box with the player name and masked phone | Lucky Dip | Same as above |
| Next step loaded in advance (code, logo, prize images) while the visitor is on the current step | Visitor apps | Route changes feel instant |
| Small route bundles, preloaded on the likely next route | All apps | Fast first load and fast route changes |
| View Transitions API for page changes, with a simple fade where not supported | Visitor apps | Smooth app-like page changes |
| Animations use transform and opacity only (CSS, Web Animations API, Canvas) | All apps | 60 fps on mid-range phones |
| Celebration effect (canvas confetti) and short vibration on Android when a prize is won | Result pages | Rewarding moment |
| Phone and stall screen start the same animation from one server event over WebSocket | Games | Phone and screen stay in step |
| Skeleton states and clear retry states, never a blank page | All apps | Feels stable on weak Wi-Fi |
| App shell cached by a service worker after the first visit | Visitor apps | Repeat scans open instantly |
| Images served as WebP or AVIF from CloudFront at the right size | All apps | Less data on venue Wi-Fi |
| Cached data with background refresh (TanStack Query), optimistic updates | Admin | Instant tab switches and saves |
| Reduced motion setting respected | All apps | Accessible |

### Response time

| Item | Target |
|---|---|
| AWS region | Asia Pacific (Mumbai), the closest region to Sri Lanka |
| API response, 95th percentile | Under 300 ms |
| Route change | Under 100 ms (next step already loaded) |
| Phone to stall screen sync | Under 300 ms |
