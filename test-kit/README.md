# LKDR test environment (AWS)

AWS account 544011261075, region Mumbai (ap-south-1), stage `dev`. Test use only.
No QuickLook needed: the QR codes open our apps directly, and each phone becomes its own test player.

## Links

| What | Open on | URL |
|---|---|---|
| **Main display: both game QR codes, then the live wheel or boxes** | TV or laptop (16:9) | https://d13c6dcdibngow.cloudfront.net |
| QR board: both game QR codes on one screen | TV or laptop (16:9) | https://dzgjpv094bem7.cloudfront.net/qr |
| QR sheet (print, or show on a laptop and scan from the screen) | Laptop | [qr-sheet.html](qr-sheet.html) |
| Admin panel | Laptop | https://d1xao3kzsoj99m.cloudfront.net |
| Spin the Wheel stall screen | TV or laptop | https://dzgjpv094bem7.cloudfront.net/stall?key=<SCREEN_KEY from .state/secrets.env> |
| Lucky Dip stall screen | TV or laptop | https://dzgjpv094bem7.cloudfront.net/stall?key=<SCREEN_KEY from .state/secrets.env> |
| Treasure Hunt leaderboard screen | TV or laptop | https://dzgjpv094bem7.cloudfront.net/leaderboard |
| Games app (opened by the game QR codes) | Phone | https://d13c6dcdibngow.cloudfront.net/q/logo_game_spin |
| Treasure Hunt app (my progress) | Phone | https://d3dyfkkspj5huf.cloudfront.net/me |

Admin sign in: user `super.admin`, password = `ADMIN_PASSWORD` in `apps/deploy-test/.state/secrets.env`.

## How it works for now

QR code opens `/q/{logoId}`. The app sends a token to `POST /auth/v1/scan-login`. The platform turns the token into a
test user (stored in our table), signs the phone in and records the scan. When QuickLook is ready, their redirect brings a
real temporary token and the platform exchanges it with their API instead (setting `tokenMode=quicklook`).
Without QuickLook there is no token, so each phone makes its own (kept on the phone). One phone = one player.

## Sessions (Colombo time)

28 Oct to 1 Nov 2026, every day: Session 1 from 00:00 to 12:00, Session 2 from 12:00 to 23:59.
One game per player per session. Change sessions, prizes and logos in the admin panel.

## Test steps

1. On a TV or laptop, open the main display (the games address). It shows the Spin the Wheel and Lucky Dip QR codes.
2. Scan **Spin the Wheel** with a phone camera. The game opens on the phone and the big screen shows the wheel at once.
3. Tap **SPIN!**. Phone and big screen spin together and land on the same prize. The reference is on the phone only.
4. Scan **Lucky Dip** with the same phone: "already played this session". A second phone can play.
5. Treasure Hunt: QuickLook counts the stall logo scans, so it can only be tried on AWS once the Leaderboard API address
   and key for this environment are set (see 04-treasure-hunt/README.md). Locally the QuickLook mock simulates it.
6. Admin panel, Prize desk: type the reference, Show name, Mark as collected.
7. Hunt winners: Admin, Treasure Hunt, Sessions, **End now** on the running session. Winners appear within about a minute
   in Leaderboard and winners. Confirm one, then it shows on that player's phone.
8. To become a new player on the same phone: clear the site data for the games and hunt sites, or use a private tab.
9. To start again with fresh data (no redeploy): `npm run reset` in `apps/deploy-test`.

## Automated checks before a release

The QA suite runs about 120 checks against the local copy (never AWS): visitor games rules, admin roles and limits, prize desk, Treasure Hunt standings from the (mock) QuickLook leaderboard and winners, and every screen on phone, laptop and TV sizes. The last part plays a real 6 minute session with 10 prizes and checks that the prizes are spread across it, so a full run takes about 15 minutes.

1. Start the local stack (apps/README.md, "Run everything on your computer"), including all four web apps and the QuickLook
   mock (`cd apps/backend/quicklook-mock && npm run dev`, port 4010), which answers the Leaderboard API for the hunt.
2. Run it from apps/deploy-test:

```bash
npm run qa
```

It empties the local database and loads the demo data first, so every run starts the same way. Each check prints PASS or FAIL, and the run ends with a summary.

## Update or remove

```bash
cd apps/deploy-test
AWS_PROFILE=default EXPECTED_ACCOUNT=544011261075 SKIP_SEED=1 npm run deploy   # update code, keep data
AWS_PROFILE=default EXPECTED_ACCOUNT=544011261075 npm run destroy               # remove everything
```
