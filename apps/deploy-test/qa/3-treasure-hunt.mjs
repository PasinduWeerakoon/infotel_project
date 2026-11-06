// QA session 3: Treasure Hunt with QuickLook pushing every stall scan to our API, encrypted
// (decision D-20). The scans are encrypted here with the local test key, like QuickLook's backend
// does, and the counting, leaderboard and winners follow.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HUNT, adminAs, check, expectStatus, summary, wait } from './lib.mjs';

const H = `${HUNT}/admin/v1/hunt`;
const env = readFileSync(new URL('../../backend/treasure-hunt-api/.env', import.meta.url), 'utf8');
const KEY = env.match(/^HUNT_SCAN_KEY=(.*)$/m)?.[1]?.trim();
const logo = (n) => `0b6f2a10-1c1e-4a61-9a01-00000000000${n}`;

/** Encrypts a scan like QuickLook's backend: hex(iv 12 | AES-256-GCM ciphertext | tag 16) */
function encrypt(payload, keyHex = KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}
async function send(message) {
  const res = await fetch(`${HUNT}/integrations/quicklook/v1/hunt-scans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: message }),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, code: data?.error?.code, data };
}
const scan = (userId, userName, n, extra = {}) =>
  send(encrypt({ logo_id: logo(n), user_id: userId, user_name: userName, scanned_at: new Date().toISOString(), ...extra }));

const su = await adminAs();
const session = (await su.call('GET', `${HUNT}/hunt/v1/status`)).data.session;
check('H0', 'a hunt session is open', session?.state === 'open', JSON.stringify(session));
const S = `${H}/sessions/${session.sessionId}`;

const a = `qa-${randomUUID()}`;
const b = `qa-${randomUUID()}`;
const c = `qa-${randomUUID()}`;
let r = await scan(a, 'Amal Perera', 1);
check('H1', 'QuickLook sends a scan, it counts', r.status === 200 && r.data.result === 'counted', JSON.stringify(r));
r = await scan(a, 'Amal Perera', 1);
check('H2', 'the same logo again is stored, but does not count', r.data?.result === 'repeat', JSON.stringify(r));
// QuickLook sends only the hunt's allocated logos, so any logo it sends counts (no logo list)
r = await scan(a, 'Amal Perera', 9);
check('H3', 'any logo QuickLook sends counts, there is no logo list to load', r.data?.result === 'counted', JSON.stringify(r));
// Bimali scans 3 logos at the same moment: all three count, none twice
await Promise.all([3, 4, 5, 5, 3].map((n) => scan(b, 'Bimali Silva', n)));
await scan(c, 'Chathura Dias', 6);
await wait(20);
await scan(c, 'Chathura Dias', 7); // c reaches 2 logos after a did

const parts = (await su.call('GET', `${S}/participants`)).data.items;
const pa = parts.find((p) => p.userId === a);
const pb = parts.find((p) => p.userId === b);
const pc = parts.find((p) => p.userId === c);
check('H4', 'repeats and parallel repeats never count twice (Amal 2, Bimali 3)', pa?.stalls === 2 && pb?.stalls === 3, `${pa?.stalls} ${pb?.stalls}`);
check('H5', 'points are logos times points per stall', pa?.points === 2 * session.pointsPerStall, String(pa?.points));
check('H6', 'every scan is counted in the total, repeats included', pa?.totalScans === 3 && pb?.totalScans === 5, `${pa?.totalScans} ${pb?.totalScans}`);
check('H7', 'the most logos is rank 1, a tie goes to whoever got there first', pb?.rank === 1 && pa?.rank === 2 && pc?.rank === 3, `${pb?.rank} ${pa?.rank} ${pc?.rank}`);
check('H8', 'admin sees the QuickLook user ID and the user name', pb?.userId === b && pb.fullName === 'Bimali Silva', JSON.stringify(pb).slice(0, 200));

const lb = (await (await fetch(`${HUNT}/hunt/v1/leaderboard`)).json());
check('H9', 'leaderboard in rank order with the logo count', lb.top?.[0]?.stalls === 3 && lb.top.map((x) => x.rank).join() === '1,2,3', JSON.stringify(lb.top));
check('H10', 'public leaderboard shows the QuickLook names, never user IDs', lb.top?.[0]?.name === 'Bimali Silva' && !/qa-|userId|fullName/.test(JSON.stringify(lb)), JSON.stringify(lb).slice(0, 300));
const live = (await su.call('GET', `${S}/live`)).data;
check('H11', 'live view shows players, scans received and the last scan time', live.players === 3 && live.scans >= 10 && Boolean(live.lastScanAt), JSON.stringify({ p: live.players, s: live.scans, t: live.lastScanAt }));
const scans = (await su.call('GET', `${S}/scans?userId=${a}`)).data.items;
check('H12', 'every scan received is kept with its result and receive time', scans.length === 3 && scans.every((s) => s.receivedAt) && scans.some((s) => s.result === 'repeat'), JSON.stringify(scans.map((s) => s.result)));

// The phone leaderboard lists everyone, 10 per page: 22 more players make 25, so 3 pages
await Promise.all(Array.from({ length: 22 }, (_, i) => scan(`qa-${randomUUID()}`, `QA Page Player ${i + 1}`, 2)));
const page = async (n) => (await fetch(`${HUNT}/hunt/v1/leaderboard?page=${n}`)).json();
const [p1, p2, p3, p4] = await Promise.all([page(1), page(2), page(3), page(4)]);
check('H12a', 'page 1 has places 1 to 10, the same as the big screen top 10', p1.top.map((x) => x.rank).join() === '1,2,3,4,5,6,7,8,9,10' && p1.top[0].name === 'Bimali Silva' && p1.page === 1 && p1.pages === 3, `${p1.page}/${p1.pages} ${p1.top.map((x) => x.rank)}`);
check('H12b', 'page 2 has places 11 to 20', p2.top.map((x) => x.rank).join() === '11,12,13,14,15,16,17,18,19,20' && p2.page === 2, p2.top.map((x) => x.rank).join());
check('H12c', 'page 3 has the last 5 players (21 to 25)', p3.top.map((x) => x.rank).join() === '21,22,23,24,25' && p3.pages === 3, p3.top.map((x) => x.rank).join());
const listed = [...p1.top, ...p2.top, ...p3.top].map((x) => x.playerNumber);
check('H12d', 'every player is on exactly one page, never two', new Set(listed).size === 25 && listed.length === 25, `${new Set(listed).size} of ${listed.length}`);
check('H12e', 'a page past the end is empty, the pages still say 3', p4.top.length === 0 && p4.pages === 3, `${p4.top.length} ${p4.pages}`);
await wait(3100); // the top 10 read for H9 is cached for 3 seconds
const tv = await (await fetch(`${HUNT}/hunt/v1/leaderboard?top=10`)).json();
check('H12f', 'the big screen still gets the top 10 only, without pages', tv.top.length === 10 && tv.pages === undefined, `${tv.top.length} ${tv.pages}`);
const bad404 = await fetch(`${HUNT}/hunt/v1/leaderboard?page=0`);
check('H12g', 'page 0 is refused', bad404.status === 400, String(bad404.status));

// Refused messages
r = await send(encrypt({ logo_id: logo(1), user_id: a, user_name: 'x' }, 'ab'.repeat(32)));
expectStatus('H13', 'a message made with another key is refused', r, 400, 'MESSAGE_INVALID');
r = await scan(a, 'Amal Perera', 3, { scanned_at: new Date(Date.now() - 10 * 60_000).toISOString() });
expectStatus('H14', 'a scan older than 5 minutes is refused (no replay into a later session)', r, 400, 'MESSAGE_EXPIRED');
const eventId = `evt_${randomUUID()}`;
await scan(c, 'Chathura Dias', 8, { event_id: eventId });
r = await scan(c, 'Chathura Dias', 8, { event_id: eventId });
check('H15', 'a resent scan with the same event ID is stored once', r.data?.result === 'already-received', JSON.stringify(r));

// The end: scans after it do not count, winners are worked out and flagged
expectStatus('H16', 'end the session early', await su.call('POST', `${S}/end`), 200);
await wait(1000);
r = await scan(c, 'Chathura Dias', 1);
check('H17', 'a scan after the end is stored but does not count', r.data?.result === 'no-session', JSON.stringify(r));
let winners = [];
for (let i = 0; i < 15 && winners.length === 0; i++) {
  await wait(2000);
  winners = (await su.call('GET', `${S}/winners`)).data?.items ?? [];
}
check('H18', 'winners are worked out after the end, with the QuickLook user ID', winners.length === 3 && winners[0].userId === b && winners[0].fullName === 'Bimali Silva', JSON.stringify(winners.map((w) => [w.rank, w.fullName, w.stalls])));
const flagged = (await su.call('GET', `${S}/participants`)).data.items;
check('H19', 'the winners are flagged on the participants', flagged.find((p) => p.userId === b)?.winnerRank === 1 && flagged.filter((p) => p.winnerRank).length === 3, JSON.stringify(flagged.map((p) => [p.fullName, p.winnerRank])));
if (winners.length) {
  const first = winners[0];
  expectStatus('H20', 'collecting before confirming is refused', await su.call('POST', `${S}/winners/1/collect`), 409, 'CANNOT_COLLECT');
  expectStatus('H21', 'disqualify rank 1', await su.call('POST', `${S}/winners/1/disqualify`), 200);
  const after = (await su.call('GET', `${S}/winners`)).data?.items ?? [];
  check('H22', 'next player moves up to rank 1', after[0] && after[0].userId !== first.userId, JSON.stringify(after.map((w) => [w.rank, w.fullName])));
  expectStatus('H23', 'confirm the new rank 1', await su.call('POST', `${S}/winners/1/confirm`), 200);
  expectStatus('H24', 'collect rank 1', await su.call('POST', `${S}/winners/1/collect`), 200);
  expectStatus('H25', 'collect rank 1 twice is refused', await su.call('POST', `${S}/winners/1/collect`), 409);
  const view = (await (await fetch(`${HUNT}/hunt/v1/leaderboard`)).json());
  check('H26', 'leaderboard shows winners after the end', (view.winners?.length ?? 0) > 0, JSON.stringify(view).slice(0, 300));
  expectStatus('H27', 'a finalized session cannot be started again', await su.call('POST', `${S}/start`), 409, 'ALREADY_ENDED');
}

// Next session rules
const all = (await su.call('GET', `${H}/sessions?date=${session.startsAt.slice(0, 10)}`)).data.items;
const next = all.find((s) => s.status === 'scheduled');
if (next) expectStatus('H28', 'start the next session early once nothing runs', await su.call('POST', `${H}/sessions/${next.sessionId}/start`), 200);
const bad = await su.call('POST', `${H}/sessions`, { name: 'QA', date: '2026-13-45', start: '09:00', end: '10:00', pointsPerStall: 10, winnersCount: 3, prizes: [], allowPreviousWinners: true });
check('H29', 'invalid hunt date is refused', bad.status === 400, `got ${bad.status}`);
if (bad.status === 201) await su.call('DELETE', `${H}/sessions/${bad.data.sessionId}`);

summary();
