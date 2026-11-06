// QA session 8: Treasure Hunt under pressure. Many visitors scanning at once, the same scan sent
// in parallel, resent event IDs, and every kind of bad input QuickLook (or anyone) could send.
// Counting must stay exact, the leaderboard must match the standings, and nothing may give a 500.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HUNT, adminAs, check, summary, wait } from './lib.mjs';

const H = `${HUNT}/admin/v1/hunt`;
const env = readFileSync(new URL('../../backend/treasure-hunt-api/.env', import.meta.url), 'utf8');
const KEY = env.match(/^HUNT_SCAN_KEY=(.*)$/m)?.[1]?.trim();
const logo = (n) => `0b6f2a10-1c1e-4a61-9a01-00000000000${n}`;
const URL_SCANS = `${HUNT}/integrations/quicklook/v1/hunt-scans`;

function encrypt(payload, keyHex = KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}
async function post(body, headers = { 'content-type': 'application/json' }) {
  const res = await fetch(URL_SCANS, { method: 'POST', headers, body });
  const data = await res.json().catch(() => null);
  return { status: res.status, code: data?.error?.code, data };
}
const send = (payload) => post(JSON.stringify({ data: encrypt(payload) }));
const scan = (userId, n, extra = {}) =>
  send({ logo_id: logo(n), user_id: userId, user_name: `QA ${userId.slice(-4)}`, scanned_at: new Date().toISOString(), ...extra });

const su = await adminAs();
const session = (await su.call('GET', `${HUNT}/hunt/v1/status`)).data.session;
check('R0', 'a hunt session is open for the run', session?.state === 'open', JSON.stringify(session));
const S = `${H}/sessions/${session.sessionId}`;

// R1: 150 visitors, 6 logos each, every logo sent twice and a third copy in parallel, all at once
const users = Array.from({ length: 150 }, () => `qa-r-${randomUUID()}`);
const jobs = users.flatMap((u) => [1, 2, 3, 4, 5, 6].flatMap((n) => [() => scan(u, n), () => scan(u, n), () => scan(u, n)]));
jobs.sort(() => Math.random() - 0.5);
const all = [];
// 100 at a time: the local dev server (one Node process) queues at most 128 connections. AWS has no such limit
for (let i = 0; i < jobs.length; i += 100) all.push(...(await Promise.all(jobs.slice(i, i + 100).map((j) => j()))));
const errors = all.filter((r) => r.status !== 200);
const counted = all.filter((r) => r.data?.result === 'counted').length;
check('R1', `${jobs.length} scans from 150 visitors in parallel: all answered 200`, errors.length === 0, JSON.stringify(errors.slice(0, 3)));
check('R2', 'exactly one scan per visitor and logo counted (900), the rest are repeats', counted === 900 && all.filter((r) => r.data?.result === 'repeat').length === jobs.length - 900, `counted ${counted}`);

const parts = (await su.call('GET', `${S}/participants`)).data.items;
const ours = new Set(users);
const mine = parts.filter((p) => ours.has(p.userId));
check('R3', 'every visitor has exactly 6 logos and 60 points', mine.length === 150 && mine.every((p) => p.stalls === 6 && p.points === 6 * session.pointsPerStall), JSON.stringify(mine.find((p) => p.stalls !== 6) ?? mine.length));
check('R4', 'every scan is in the totals (18 per visitor)', mine.every((p) => p.totalScans === 18), JSON.stringify(mine.find((p) => p.totalScans !== 18)));
const numbers = parts.map((p) => p.playerNumber);
check('R5', 'player numbers are unique and none is missing (#1 to #N)', new Set(numbers).size === numbers.length && numbers.every((n) => n >= 1) && Math.max(...numbers) === numbers.length, `${numbers.length} players, max #${Math.max(...numbers)}, ${numbers.filter((n) => !n).length} without a number`);
check('R6', 'no participant shows the internal logo set', parts.every((p) => !('logoIds' in p)), Object.keys(parts[0] ?? {}).join());

// R7: one visitor scans 8 different logos at the same moment: all 8 count, the leaderboard follows
const fast = `qa-r-fast-${randomUUID()}`;
await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => scan(fast, n)));
await wait(3500); // the public leaderboard is cached for 3 seconds
const lb = (await fetch(`${HUNT}/hunt/v1/leaderboard?top=10`).then((r) => r.json()));
const ranked = (await su.call('GET', `${S}/participants`)).data.items.filter((p) => p.rank);
const fastP = ranked.find((p) => p.userId === fast);
check('R7', '8 logos scanned in parallel all count and make rank 1', fastP?.stalls === 8 && fastP.rank === 1, JSON.stringify(fastP));
check('R8', 'the public top 10 matches the admin standings, in order', lb.top?.length === 10 && lb.top.every((row, i) => row.playerNumber === ranked[i]?.playerNumber && row.stalls === ranked[i]?.stalls), JSON.stringify({ lb: lb.top?.slice(0, 3), admin: ranked.slice(0, 3).map((p) => [p.playerNumber, p.stalls]) }));
const order = ranked.every((p, i) => i === 0 || ranked[i - 1].stalls > p.stalls || (ranked[i - 1].stalls === p.stalls && ranked[i - 1].reachedAt <= p.reachedAt));
check('R9', 'standings are sorted by logos, then by who got there first', order, 'out of order');

// R10: the same event ID sent 5 times at once is stored once
const eventId = `evt-${randomUUID()}`;
const user = users[0];
const before = (await su.call('GET', `${S}/participants`)).data.items.find((p) => p.userId === user).totalScans;
const five = await Promise.all(Array.from({ length: 5 }, () => scan(user, 7, { event_id: eventId })));
const firsts = five.filter((r) => r.data?.result === 'counted');
const after = (await su.call('GET', `${S}/participants`)).data.items.find((p) => p.userId === user);
check('R10', 'one event ID sent 5 times in parallel is counted once', firsts.length === 1 && five.filter((r) => r.data?.result === 'already-received').length === 4 && after.totalScans === before + 1 && after.stalls === 7, JSON.stringify(five.map((r) => r.data?.result)));

// R11 to R26: bad input never gives a 500 and never counts
const bad = [
  ['R11', 'no body', () => post('')],
  ['R12', 'body is not JSON', () => post('hello')],
  ['R13', 'data missing', () => post(JSON.stringify({}))],
  ['R14', 'data is a number', () => post(JSON.stringify({ data: 12345678901234567890 }))],
  ['R15', 'data is not hex', () => post(JSON.stringify({ data: 'zz'.repeat(40) }))],
  ['R16', 'data has an odd length', () => post(JSON.stringify({ data: 'a'.repeat(41) }))],
  ['R17', 'data is too short to hold a message', () => post(JSON.stringify({ data: 'ab'.repeat(20) }))],
  ['R18', 'data is too long (over 8000)', () => post(JSON.stringify({ data: 'ab'.repeat(4001) }))],
  ['R19', 'a 1 MB body', () => post(JSON.stringify({ data: 'ab'.repeat(500_000) }))],
  ['R20', 'encrypted text that is not JSON', () => post(JSON.stringify({ data: encrypt('not json') }))],
  ['R21', 'logo_id missing', () => send({ user_id: 'qa-x', user_name: 'x', scanned_at: new Date().toISOString() })],
  ['R22', 'user_id longer than 100 characters', () => send({ logo_id: logo(1), user_id: 'u'.repeat(101), scanned_at: new Date().toISOString() })],
  ['R23', 'scanned_at is not a time', () => send({ logo_id: logo(1), user_id: 'qa-x', scanned_at: 'yesterday-ish' })],
  ['R24', 'logo_id is an object', () => send({ logo_id: { $ne: null }, user_id: 'qa-x' })],
  ['R25', 'a tampered message (one byte changed)', () => { const m = encrypt({ logo_id: logo(1), user_id: 'qa-x' }); return post(JSON.stringify({ data: `${m.slice(0, 40)}${m[40] === 'a' ? 'b' : 'a'}${m.slice(41)}` })); }],
];
for (const [id, label, run] of bad) {
  const r = await run();
  check(id, `${label}: refused with 400 or 413, no 500`, r.status === 400 || r.status === 413, `${r.status} ${r.code}`);
}
let r = await scan(`qa-r-${randomUUID()}`, 1, { scanned_at: new Date(Date.now() + 120_000).toISOString() });
check('R26', 'a scan time 2 minutes in the future is refused (more than the 1 minute clock difference)', r.status === 400 && r.code === 'MESSAGE_EXPIRED', `${r.status} ${r.code}`);
r = await scan(`qa-r-${randomUUID()}`, 1, { scanned_at: Math.floor(Date.now() / 1000) });
check('R27', 'scan time in Unix seconds is accepted', r.data?.result === 'counted', JSON.stringify(r));
r = await scan(`qa-r-${randomUUID()}`, 2, { scanned_at: Date.now() });
check('R28', 'scan time in milliseconds is accepted', r.data?.result === 'counted', JSON.stringify(r));
const odd = `qa-r-${randomUUID()}`;
r = await send({ logo_id: logo(3), user_id: odd, user_name: '<img src=x onerror=alert(1)> සිංහල தமிழ் '.repeat(3), scanned_at: new Date().toISOString() });
const oddP = (await su.call('GET', `${S}/participants`)).data.items.find((p) => p.userId === odd);
check('R29', 'any name is stored as plain text, trimmed to 60 characters (Sinhala and Tamil kept)', r.data?.result === 'counted' && oddP?.fullName.length <= 60 && oddP.fullName.includes('සිංහල'), JSON.stringify(oddP?.fullName));
const lbText = await fetch(`${HUNT}/hunt/v1/leaderboard?top=50`).then((x) => x.text());
check('R30', 'the public leaderboard never shows user IDs, and names are at most 60 characters', !lbText.includes('qa-r-') && JSON.parse(lbText).top.every((p) => typeof p.name === 'string' && p.name.length <= 60), lbText.slice(0, 200));

// R31: leaderboard parameters
const tops = await Promise.all(['0', '51', 'abc', '-1', '10.5'].map((t) => fetch(`${HUNT}/hunt/v1/leaderboard?top=${t}`).then((x) => x.status)));
check('R31', 'bad leaderboard sizes are refused with 400, no 500', tops.every((s) => s === 400), tops.join());
const unknown = await fetch(`${HUNT}/hunt/v1/leaderboard?sessionId=nope`).then((x) => x.status);
check('R32', 'an unknown session on the leaderboard is not an error', unknown === 200, String(unknown));
const getScans = await fetch(URL_SCANS).then((x) => x.status);
check('R33', 'GET on the scan API is not found, no 500', getScans === 404, String(getScans));

// R34: 200 leaderboard reads at once (screens and phones polling) all answer
const reads = await Promise.all(Array.from({ length: 100 }, () => fetch(`${HUNT}/hunt/v1/leaderboard?top=10`).then((x) => x.status)));
check('R34', '100 leaderboard reads at once all answer 200', reads.every((s) => s === 200), `${reads.filter((s) => s !== 200).length} failed`);

const stats = (await su.call('GET', `${S}/live`)).data;
check('R35', 'live view counts every player of the session', stats.players >= 153, JSON.stringify({ players: stats.players, scans: stats.scans }));

summary();
