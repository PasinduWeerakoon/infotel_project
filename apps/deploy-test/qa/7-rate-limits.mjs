// Session 7: per-visitor and per-IP rate limits (HTTP 429), never shared between visitors
import { GAMES, check, expectStatus, person, summary } from './lib.mjs';

const a = await person();
const entry = await a.enter('logo_game_spin');
check('L0', 'a visitor gets an entry to read', entry.status === 201, `${entry.status} ${entry.code}`);
const id = entry.data?.entryId;

// The entry was 1 request this minute; read it until the per-visitor limit (60 a minute) is passed
const reads = await Promise.all(Array.from({ length: 64 }, () => a.call('GET', `${GAMES}/games/v1/entries/${id}`)));
const ok = reads.filter((r) => r.status === 200).length;
const limited = reads.filter((r) => r.status === 429 && r.code === 'RATE_LIMITED');
check('L1', 'a visitor over 60 requests a minute gets 429 RATE_LIMITED', ok === 59 && limited.length === 5, `${ok} ok, ${limited.length} limited`);
check('L2', 'the 429 says when to try again', limited.every((r) => r.data?.error?.details?.retryAfterSeconds > 0), JSON.stringify(limited[0]?.data));

const b = await person();
const other = await b.enter('logo_game_dip');
check('L3', 'another visitor on the same Wi-Fi is not blocked', other.status === 201 || other.code === 'GAME_IN_PROGRESS', `${other.status} ${other.code}`);
expectStatus('L4', 'the limited visitor is refused again in the same minute', await a.call('GET', `${GAMES}/games/v1/entries/${id}`), 429, 'RATE_LIMITED');

summary();
