/**
 * Item keys of the `treasure-hunt` table (docs: 04-treasure-hunt/data-model.md).
 *
 * | Item        | PK                    | SK                          | Index                                   |
 * |-------------|-----------------------|-----------------------------|-----------------------------------------|
 * | Session     | SESSION#{sessionId}   | META                        | GSI1: SESSIONS, GSI2: DATE#{date}       |
 * | Participant | SESSION#{sessionId}   | PART#{userId}               | GSI1: LB#{sessionId} by QuickLook rank  |
 * | Sync status | SESSION#{sessionId}   | SYNC                        | last read from QuickLook                |
 * | Counter     | SESSION#{sessionId}   | COUNTER                     | next player number                      |
 * | Winner      | SESSION#{sessionId}   | WINNER#{rank, 3 digits}     |                                         |
 * | Day winner  | WINNERDAY#{date}      | USER#{userId}               | previous-winner rule                    |
 */
export const keys = {
  session: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'META' }),
  participant: (sessionId: string, userId: string) => ({ PK: `SESSION#${sessionId}`, SK: `PART#${userId}` }),
  sync: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'SYNC' }),
  counter: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'COUNTER' }),
  winner: (sessionId: string, rank: number) => ({
    PK: `SESSION#${sessionId}`,
    SK: `WINNER#${String(rank).padStart(3, '0')}`,
  }),
  dayWinner: (date: string, userId: string) => ({ PK: `WINNERDAY#${date}`, SK: `USER#${userId}` }),
};

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
