/**
 * Item keys of the `platform` table (single-table design).
 *
 * | Item  | PK              | SK                 |
 * |-------|-----------------|--------------------|
 * | Scan  | SCAN#{scanId}   | META               |
 * | Logo  | LOGO            | LOGO#{logoId}      |
 * | Admin | ADMIN           | USER#{username}    |
 * | Visitor (mock token mode only) | VISITOR | USER#{userId} |
 *
 * The Games Event API reads and marks scans in this table (shared on purpose).
 */
export const keys = {
  scan: (scanId: string) => ({ PK: `SCAN#${scanId}`, SK: 'META' }),
  logo: (logoId: string) => ({ PK: 'LOGO', SK: `LOGO#${logoId}` }),
  admin: (username: string) => ({ PK: 'ADMIN', SK: `USER#${username}` }),
  visitor: (userId: string) => ({ PK: 'VISITOR', SK: `USER#${userId}` }),
};
