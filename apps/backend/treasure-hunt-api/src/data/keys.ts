/**
 * Item keys of the `treasure-hunt` table (docs: 04-treasure-hunt/data-model.md).
 *
 * | Item        | PK                    | SK                              | Index                               |
 * |-------------|-----------------------|---------------------------------|-------------------------------------|
 * | Session     | SESSION#{sessionId}   | META                            | GSI1: SESSIONS, GSI2: DATE#{date}   |
 * | Participant | SESSION#{sessionId}   | PART#{userId}                   | GSI1: LB#{sessionId} by logos, time |
 * | Visit       | SESSION#{sessionId}   | VISIT#{userId}#{logoId}         | first scan of a logo (counts once)  |
 * | Stats       | SESSION#{sessionId}   | STATS                           | scans received, last scan time      |
 * | Counter     | SESSION#{sessionId}   | COUNTER                         | next player number                  |
 * | Winner      | SESSION#{sessionId}   | WINNER#{rank, 3 digits}         |                                     |
 * | Scan        | SCANS#{sessionId}     | {receivedAt}#{random}           | every scan as received              |
 * | Event ID    | EVENT#{eventId}       | META                            | a resent scan is stored once (TTL)  |
 * | Event logo  | LOGOS                 | LOGO#{logoId}                   | loaded once from QuickLook          |
 * | Day winner  | WINNERDAY#{date}      | USER#{userId}                   | previous-winner rule                |
 */
export const keys = {
  session: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'META' }),
  participant: (sessionId: string, userId: string) => ({ PK: `SESSION#${sessionId}`, SK: `PART#${userId}` }),
  visit: (sessionId: string, userId: string, logoId: string) => ({
    PK: `SESSION#${sessionId}`,
    SK: `VISIT#${userId}#${logoId}`,
  }),
  stats: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'STATS' }),
  counter: (sessionId: string) => ({ PK: `SESSION#${sessionId}`, SK: 'COUNTER' }),
  winner: (sessionId: string, rank: number) => ({
    PK: `SESSION#${sessionId}`,
    SK: `WINNER#${String(rank).padStart(3, '0')}`,
  }),
  /** Scans outside any session are kept under the day they arrived */
  scans: (sessionId: string | null, day: string) => `SCANS#${sessionId ?? `NONE#${day}`}`,
  event: (eventId: string) => ({ PK: `EVENT#${eventId}`, SK: 'META' }),
  logo: (logoId: string) => ({ PK: 'LOGOS', SK: `LOGO#${logoId}` }),
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
