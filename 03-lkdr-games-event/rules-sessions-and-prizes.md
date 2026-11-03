# Project A: Rules, Sessions and Prizes

## 1. Sessions

Admins define sessions in the LKDR Admin Dashboard.

| Field | Example | Rule |
|---|---|---|
| Name | Morning session | Required |
| Date | 2026-11-02 | Required |
| Start and end time | 09:00 to 13:00 | End after start. Sessions on the same day must not overlap |
| Games | Spin the Wheel, Lucky Dip | One or both |
| Status | Scheduled, Open, Closed | Set by the scheduler at start and end. Admins can open or close early (see below) |

Example day:

| Session | Time |
|---|---|
| Session 1 | 09:00 to 13:00 |
| Session 2 | 13:00 to 17:00 |
| Session 3 | 17:00 to 21:00 |

All times are Asia/Colombo and decided by the server clock.

Staff controls:

| Action | Allowed when |
|---|---|
| Open a session early | It is today's session, it has not reached its end time, no other session is running, and no earlier session of today is still waiting to start. Only one session can ever be open at a time. A session closed early can be opened again on the same rules |
| Close a session early | Nobody is playing it at that moment. If a visitor is getting ready or watching the result, the admin is asked to try again when the play finishes (within about a minute) |
| Pause a game | Nobody is playing that game at that moment, same as above. Opening a paused game is always allowed |

Sessions are not extended. To run longer, edit the end time before the session ends.

## 2. Prize catalogue

| Field | Example |
|---|---|
| Prize | Pen drive |
| Total stock for the event | 75 |
| Main prize | Yes (has its own winning moments and follows the repeat-winner rule) |

Example catalogue from the LKDR requirement: Pen drive, Domain, Headset, Power bank, Umbrella (main prizes) and Chocolate.

## 3. Allocating prizes to sessions

Each session gets a quantity of each prize **per game**. The total across sessions can never exceed the prize's stock.

Admins can type the quantities directly, or use **auto-split**:

1. Enter the totals for a day and a game (for example Spin the Wheel: Pen drive 25, Domain 10, Headset 10, Power bank 10, Umbrella 5, Chocolate 80).
2. Choose the split ratio: by session length (default) or custom weights (for example 42 : 45 : 53).
3. For each prize, each session's share is `total x weight / sum of weights`.
4. Each share is rounded down, and the leftover units go to the sessions with the largest fractions (largest remainder method).
5. The admin reviews the preview, edits any number and saves.

Auto-split only uses sessions that are running or still to come. Sessions that have already ended are left out.

Worked example, Pen drive 25 with weights 42 : 45 : 53:

| Session | Exact share | Rounded down | Fraction | Final |
|---|---|---|---|---|
| Session 1 | 7.50 | 7 | 0.50 | 8 |
| Session 2 | 8.04 | 8 | 0.04 | 8 |
| Session 3 | 9.46 | 9 | 0.46 | 9 |
| Total | 25.00 | 24 | | 25 |

One unit was left over, so it went to Session 1 (largest fraction).

Saving allocations:

- Saves run one at a time. When two admins save together, the second save is checked against the first one's quantities, so the totals can never go over stock. The latest save wins when it still fits, otherwise it is refused with the reason.
- Only the prizes being saved are checked against stock, and a change that lowers a prize's total is always allowed.

## 4. Every play wins, main prizes at winning moments

As in the project document, **every play wins a prize** and there is no "Try again" in either game. The stock of a session is sized for the plays it expects (for example 140 plays a day: Pen drive 25, Domain 10, Headset 10, Power bank 10, Umbrella 5, Chocolate 80). Chocolate is the filler prize.

- **Main prizes** (marked "Main prize" in the catalogue: pen drive, domain, headset, power bank, umbrella) are spread across the session, so the first players do not get them all.
- **Filler prizes** (every prize not marked main, such as chocolate) go to every other play.
- When the session's stock is used up, the next scans get "All prizes for this session have been given out", before any play.

When a main prize is given:

1. Every main prize unit of a session and game gets a secret **winning moment**, a time inside the session. The session is cut into equal slots, one per unit, and each moment falls at a random time inside its slot. The first player after a moment wins that main prize.
2. **In step with the filler:** when half the filler is given, at least half the main prizes are due. So a big crowd that uses the stock up early still gets main prizes spread across its players, not all at the end.
3. **No new moments in the last 10% of the session** (10 minutes at most). Anything still waiting goes to the next players, so main prizes are used up before the end.
4. **One prize per play.** After a quiet spell several moments may be waiting. They go to the next players one each.
5. If the filler runs out while main prizes are left, the next players get the main prizes left.

Example: Spin the Wheel has 25 Chocolates and 17 main prizes in a 2 hour session (10:00 to 12:00).

| Time | What happens |
|---|---|
| 10:00 to 11:48 | Every player wins. About one main prize moment every 6 minutes, everyone else gets a Chocolate |
| 11:48 to 12:00 | No new moments. Main prizes still waiting go to the next players |
| Stock used up | "All prizes for this session have been given out" until the next session |

The admin Allocation page shows, per game, about how many players a session can serve (about 30 seconds per player) and warns when there are more prizes than players.

**Which prize is won:** the prize is picked at random in proportion to what is left of that kind (main prizes when a main moment is due, otherwise filler prizes).

```text
remaining = { Pen drive: 7, Domain: 3, Headset: 3, Power bank: 3, Umbrella: 1 }
total     = 17
r         = secure random integer from 0 to 16
walk the list adding counts until the running total is greater than r: that prize is won
```

Technical rules:

- The moments are not stored. They are worked out again on every play from a secret per session and game, so changing an allocation simply gives a new set of moments. Main prizes added in the middle of a session also get moments for the time already passed, so the next players may win them quickly.
- When staff open a session early, the moments are spread from the time it was opened.
- Random picks come from a cryptographically secure generator (`crypto.randomInt`).
- Remaining quantities and moments are never sent to visitors.
- Every win decrements the allocation with a conditional write (remaining > 0), so a session never gives more than its allocation. If two plays race for the last unit, one of them draws again (up to 3 attempts).

## 5. Checks for the spread

These run automatically before every release (see the test kit README):

- Unit tests for every play winning, moment placement, release in step with the filler, the end gap, one prize per play and the repeat-winner rule.
- A simulation of hundreds of sessions (normal, busy, quiet and peak crowds, 1, 2 and 3 hour sessions). It fails if any player leaves without a prize while stock is left, if a prize is ever given twice, if less than 95% of the main prizes are given, or if one quarter of the players gets too many or too few main prizes.
- A real 6 minute session on the local system with 30 chocolates, 4 main prizes and a player every 10 seconds. It checks that every player wins, that the wheel has no "Try again", that the main prizes are spread across the session and that the scans after the last prize are told nothing is left.

## 6. One play per visitor per session

- Each visitor (QuickLook opaque user ID) can play **once per session**, either Spin the Wheel **or** Lucky Dip.
- Enforced by a conditional record `SESSION#{sessionId} / PLAYER#{userId}`, created in the same transaction as the entry.
- The record is created when the entry is created. If the entry expires unplayed (the visitor walks away), the record is removed so that the visitor can try again in the same session.
- A visitor who scanned while the screen was busy has not played, so they can scan again later.

## 7. Repeat-winner rule (optional setting)

When on, a visitor who has won a **main prize** on a given day can only win non-main prizes (Chocolate) for the rest of that day. A main prize moment that comes up on their play waits for the next player. If no non-main prizes are left, the visitor sees "You have already won a main prize today". LKDR must approve this rule and show it as a game rule.

## 8. Stall screen lock

- One player at a time per stall screen. No queue.
- The lock is taken when the entry is created and released when the animation finishes.
- If the visitor does not tap Play within 60 seconds (setting), the entry expires and the lock is released by the scheduler job.
- Staff can release a stuck lock from the dashboard (audited).

## 9. Unused prizes at session end

Setting `unusedPrizes`:

| Value | Behaviour |
|---|---|
| `expire` (default) | Unused prizes stay unused and are reported |
| `roll-over` | Unused quantities are added to the next session on the same day for the same game |

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Session ends while a visitor is playing | An entry created before the end can still be played until the lock timeout. Staff cannot close the session or pause the game while that play is running |
| Scan event arrives after the visitor's page opens | The entry API waits up to 3 seconds for the scan, then asks the visitor to scan again |
| Same scan used twice (refresh, shared link) | The second attempt returns the existing entry or result. A scan creates at most one entry |
| Visitor signs in on another phone | Same opaque user ID, so the one-play rule still applies |
| Prize pool empty for the session | Game shows "All prizes for this session have been given out" |
| Admin changes an allocation during a session | Allowed only upward, or downward to no lower than the quantity already given. Audited |
| Two admins save allocations at the same moment | Saves run one after the other. The totals never go over stock |
| Stall or leaderboard screen loses its connection | The screen shows "Connection lost. Reconnecting..." after 4 seconds, and after a minute asks staff to check its internet. It reconnects by itself and the message disappears |
