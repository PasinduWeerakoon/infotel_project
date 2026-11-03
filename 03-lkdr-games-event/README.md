# Project A: LKDR Games Event (Spin the Wheel and Lucky Dip)

## 1. Summary

Spin the Wheel and Lucky Dip run as **one event** at the LKDR stall. They share sessions, the prize catalogue, the stall screen and the one-play rule. A visitor scans a game logo with QuickLook, plays once per session (either game), and collects the prize with the reference shown on their phone.

## 2. Visitor journey

1. Scan the Spin the Wheel or Lucky Dip logo at the stall. Sign in with QuickLook if needed.
2. Our game page opens. The server checks:
   - the scan came from QuickLook's scan event and belongs to this visitor
   - a session is open and the game is open
   - the visitor has not played in this session (either game)
   - nobody else is playing on the stall screen
3. The visitor taps Play. The stall screen shows "Now playing" and the animation.
4. The server decides the result (winning moments spread across the session, docs: rules-sessions-and-prizes.md section 4) and shows the same result on the phone and the screen.
5. The phone moves to the result page with the reference, for example `LKDR-SW-7K3Q9X`.
6. The visitor shows the reference at the prize desk. Staff check it and mark it collected.

Sequence: [02-games-event-play-sequence.png](../02-architecture/diagrams/02-games-event-play-sequence.png)

## 3. Messages shown to visitors

| Situation | Message |
|---|---|
| Already played in this session | You have already played in this session. Please come back in the next session at 13:00. |
| Someone else is playing | Game in progress. Please wait and scan again when the screen says Ready. |
| No open session | The games are closed right now. The next session starts at 13:00. |
| Session prizes finished | All prizes for this session have been given out. The next session starts at 13:00. |
| Game paused by staff | This game is paused. Please try the other game or come back shortly. |
| Scan not recognised | Please scan the game logo at the LKDR stall to play. |

## 4. Documents

| Document | Contents |
|---|---|
| [rules-sessions-and-prizes.md](rules-sessions-and-prizes.md) | Sessions, prize allocation, weighted random draw, one-play rule, edge cases |
| [data-model.md](data-model.md) | DynamoDB table `games-event` |
| [api-plan.md](api-plan.md) | Visitor, screen and admin APIs |
| [openapi.yaml](openapi.yaml) | OpenAPI 3.1 specification |
