/**
 * Item keys of the `games-event` table (docs: 03-lkdr-games-event/data-model.md).
 *
 * | Item          | PK                          | SK                       |
 * |---------------|-----------------------------|--------------------------|
 * | Prize         | PRIZE                       | PRIZE#{prizeId}          |
 * | Session       | SESSION#{sessionId}         | META   (GSI1: SESSIONS, GSI2: DATE#{date}) |
 * | Allocation    | SESSION#{sessionId}         | ALLOC#{game}#{prizeId}   (GSI1: ALLOC) |
 * | Player guard  | SESSION#{sessionId}         | PLAYER#{userId}          |
 * | Entry         | ENTRY#{entryId}             | META   (GSI1: SESSION#{id} when played) |
 * | Reference     | REF#{reference}             | META                     |
 * | Screen        | SCREEN                      | SCREEN#{screenId}        |
 * | Screen key    | SCREENKEY#{keyHash}         | META                     |
 * | Connection    | CONN#{connectionId}         | META                     |
 * | Screen conn.  | SCREENCONN#{screenId}       | CONN#{connectionId}      |
 * | Screen lock   | LOCK                        | LOCK#{lockKey}           |
 * | Main prize    | USERDAY#{userId}#{date}     | MAIN                     |
 * | Settings      | SETTINGS                    | GLOBAL                   |
 * | Alloc. editor | ALLOCLOCK                   | META                     |
 */
import type { Game } from '../domain/types.js';

export const keys = {
  prize: (prizeId: string) => ({ PK: 'PRIZE', SK: `PRIZE#${prizeId}` }),
  session: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'META' }),
  allocation: (sessionId: string, game: Game, prizeId: string) => ({
    PK: `SESSION#${sessionId}`,
    SK: `ALLOC#${game}#${prizeId}`,
  }),
  player: (sessionId: string, userId: string) => ({ PK: `SESSION#${sessionId}`, SK: `PLAYER#${userId}` }),
  entry: (entryId: string) => ({ PK: `ENTRY#${entryId}`, SK: 'META' }),
  reference: (reference: string) => ({ PK: `REF#${reference}`, SK: 'META' }),
  screen: (screenId: string) => ({ PK: 'SCREEN', SK: `SCREEN#${screenId}` }),
  screenKey: (keyHash: string) => ({ PK: `SCREENKEY#${keyHash}`, SK: 'META' }),
  connection: (connectionId: string) => ({ PK: `CONN#${connectionId}`, SK: 'META' }),
  screenConnection: (screenId: string, connectionId: string) => ({
    PK: `SCREENCONN#${screenId}`,
    SK: `CONN#${connectionId}`,
  }),
  lock: (lockKey: string) => ({ PK: 'LOCK', SK: `LOCK#${lockKey}` }),
  mainPrizeToday: (userId: string, date: string) => ({ PK: `USERDAY#${userId}#${date}`, SK: 'MAIN' }),
  settings: () => ({ PK: 'SETTINGS', SK: 'GLOBAL' }),
  /** Held while one admin save of allocations runs, so saves never interleave */
  allocationLock: () => ({ PK: 'ALLOCLOCK', SK: 'META' }),
  /** Scan item in the shared platform table */
  platformScan: (scanId: string) => ({ PK: `SCAN#${scanId}`, SK: 'META' }),
};

/** Strips table keys and index attributes from an item before returning it. */
export function clean<T>(item: Record<string, unknown> | undefined): T | undefined {
  if (!item) return undefined;
  const {
    PK: _pk,
    SK: _sk,
    GSI1PK: _g1p,
    GSI1SK: _g1s,
    GSI2PK: _g2p,
    GSI2SK: _g2s,
    ttl: _ttl,
    ...rest
  } = item;
  return rest as T;
}
