# Project B: Rules, Sessions and Prizes

## 1. Sessions

Admins define Treasure Hunt sessions in the LKDR Admin Dashboard. They are separate from Project A sessions.

| Field | Example | Rule |
|---|---|---|
| Name | Morning hunt | Required |
| Date, start and end | 2026-11-02, 10:00 to 12:00 | No overlap on the same day |
| Points per new stall | 10 | Default 10 (to be confirmed by LKDR) |
| Winners | 3 | Number of prize ranks |
| Allow previous winners | No | Whether a winner of an earlier session can win again |
| Status | Scheduled, Active, Ended | Set by the scheduler. Admins can start early (only today's next session, and only when no other hunt session is running) or end early |

Late joiners simply have less time. All times are Asia/Colombo and decided by the server clock.

## 2. Session prizes

Each session has prizes per rank:

| Rank | Prize | Quantity |
|---|---|---|
| 1 | Power bank | 1 |
| 2 | Headset | 1 |
| 3 | Pen drive | 1 |

Admins can also use rank ranges (for example ranks 4 to 10: Chocolate).

## 3. Logos taking part

The admin selects the QuickLook logos of the event for each session (search by product name, company or logo code, or start from another session's selection). Only scans of these logos count. The selection can change until the winners are worked out. A running session is read again at once after a change.

## 4. Counting (done by QuickLook)

QuickLook's Leaderboard API counts a scan only when **all** of these are true:

1. The visitor was signed in to the QuickLook app when scanning.
2. The scan matched a logo, and that logo is one of the session's selected logos.
3. QuickLook received the scan inside the session period (start to end, or from when staff opened it early, to when staff ended it early).

The score is the number of **different** selected logos scanned. Scanning one logo again adds nothing. Points shown to visitors are stalls times the session's points per stall.

## 5. Ranking and tie-break

- QuickLook ranks by stalls, most first.
- Ties go to whoever reached their final count first. That moment is the QuickLook scan time (`scanned_at`) of the latest logo counted, so scans that arrive out of order or late still rank correctly.
- Ranks are 1, 2, 3 with no shared places. We keep QuickLook's order.
- A visitor needs at least one stall to win.
- The export lists at most 1,000 visitors. Below that, a visitor's page shows no rank until they move up.

## 6. Session end and winners

1. After the end time the job reads the final standings from QuickLook once more and **freezes** them. Scans after the end are outside the period, so QuickLook does not count them.
2. The top ranks are marked as **provisional winners**.
3. Staff review each winner in the admin dashboard (name, mobile and stalls from QuickLook) and confirm or disqualify.
4. If a winner is disqualified, the next rank moves up.
5. At the prize desk, staff find the winner by player number or name, check the name and mobile, and mark the prize collected.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Visitor scans the same logo again | Counted once by QuickLook |
| Scan of a logo not selected for the session | Not counted |
| A logo is deselected during a session | Its scans stop counting at the next read. Visitors may drop places |
| Scan after the end | Outside the period, not counted |
| Visitor not signed in to QuickLook | The scan is anonymous at QuickLook and never ranked |
| Visitor signs in on a second phone | QuickLook keeps one session per user: scans from the first phone become anonymous until they sign in there again |
| QuickLook briefly unreachable | The last standings stay on screen. The admin shows the error. The winners wait until the final read works |
| Leaderboard API not set up for the environment | The admin shows "not connected". Nothing is read |
| Fewer participants with stalls than winner ranks | Only participants with stalls win |
