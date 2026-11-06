// QA session 12: Treasure Hunt winners, every case. Three sessions run back to back today:
// A (4 winners, previous winners not allowed), B (2 winners, previous winners not allowed),
// C (3 winners, previous winners allowed). QuickLook's scans are encrypted here with the local key.
// Today's seeded sessions are moved out of the way first, so run it on local data only.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HUNT, adminAs, check, expectStatus, summary, wait } from './lib.mjs';

const H = `${HUNT}/admin/v1/hunt`;
const env = readFileSync(new URL('../../backend/treasure-hunt-api/.env', import.meta.url), 'utf8');
const KEY = env.match(/^HUNT_SCAN_KEY=(.*)$/m)?.[1]?.trim();
const logo = (n) => `0b6f2a10-1c1e-4a61-9a01-${String(n).padStart(12, '0')}`;

function encrypt(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}
/** One QuickLook scan. `at` is the scan time QuickLook sends (default: now). */
async function scan(player, n, at = Date.now()) {
  const res = await fetch(`${HUNT}/integrations/quicklook/v1/hunt-scans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: encrypt({ logo_id: logo(n), user_id: player.id, user_name: player.name, scanned_at: new Date(at).toISOString() }) }),
  });
  return (await res.json().catch(() => null))?.result;
}
const scanMany = (player, from, to, at) => Promise.all(Array.from({ length: to - from + 1 }, (_, i) => scan(player, from + i, at)));
const person = (name) => ({ id: `qa-win-${randomUUID()}`, name });

const su = await adminAs();
const colombo = (ms) => new Date(ms + 5.5 * 3600_000).toISOString();
const today = colombo(Date.now()).slice(0, 10);
const hhmm = (ms) => colombo(ms).slice(11, 16);
const minute = Math.floor(Date.now() / 60_000) * 60_000;
if (colombo(minute + 60 * 60_000).slice(0, 10) !== today) {
  console.log('Run this before 22:55 (the three test sessions need the next hour of today)');
  process.exit(1);
}

// Move today's seeded sessions out of the way: delete the waiting ones, end the running one now
for (const s of (await su.call('GET', `${H}/sessions?date=${today}`)).data.items) {
  if (s.status === 'scheduled') await su.call('DELETE', `${H}/sessions/${s.sessionId}`);
  else if (s.status === 'open') {
    await su.call('PUT', `${H}/sessions/${s.sessionId}`, { name: s.name, date: s.date, start: hhmm(Date.parse(s.startsAt)), end: hhmm(minute), pointsPerStall: s.pointsPerStall, winnersCount: s.winnersCount, prizes: s.prizes, allowPreviousWinners: s.allowPreviousWinners });
  }
}

const create = async (name, from, to, extra) => (await su.call('POST', `${H}/sessions`, { name, date: today, start: hhmm(minute + from * 60_000), end: hhmm(minute + to * 60_000), pointsPerStall: 10, ...extra })).data;
const A = await create('QA Winners A', 0, 20, { winnersCount: 4, allowPreviousWinners: false, prizes: [{ rank: 1, prizeName: 'Headset' }, { rank: 2, prizeName: 'Pen drive' }, { rank: 3, prizeName: 'Mug' }] });
const B = await create('QA Winners B', 20, 40, { winnersCount: 2, allowPreviousWinners: false, pointsPerStall: 20, prizes: [{ rank: 1, prizeName: 'Umbrella' }, { rank: 2, prizeName: 'Chocolate' }] });
const C = await create('QA Winners C', 40, 60, { winnersCount: 3, allowPreviousWinners: true, prizes: [{ rank: 1, prizeName: 'Mug' }] });
check('W0', 'three test sessions created for today', Boolean(A?.sessionId && B?.sessionId && C?.sessionId), JSON.stringify([A, B, C]).slice(0, 300));

const parts = async (s) => (await su.call('GET', `${H}/sessions/${s.sessionId}/participants`)).data.items;
const winnersOf = async (s) => (await su.call('GET', `${H}/sessions/${s.sessionId}/winners`)).data;
const board = async () => { await wait(3100); return (await fetch(`${HUNT}/hunt/v1/leaderboard`)).json(); };
const byId = (list, p) => list.find((x) => x.userId === p.id);
/** End a session now and wait for the job to work out its winners */
async function endAndFinalize(s) {
  await su.call('POST', `${H}/sessions/${s.sessionId}/end`);
  // The job marks the session finalized, waits out the scan cache (about 6 s), then lists the winners
  let finalizedAt = 0;
  for (let i = 0; i < 40; i++) {
    await wait(1000);
    const w = await winnersOf(s);
    if (w.session?.finalized && !finalizedAt) finalizedAt = Date.now();
    if (w.items.length > 0 || (finalizedAt && Date.now() - finalizedAt > 15_000)) return w;
  }
  return winnersOf(s);
}
const summaryOf = (w) => w.items.map((x) => `${x.rank}:${x.fullName}:${x.prizeName}:${x.status}`).join(' | ');

// ---------- Session A: ranking ----------
await wait(2000); // the API caches sessions for a few seconds
const kasun = person('Kasun Silva'); // 5 logos: rank 1
const nimal = person('Nimal Perera'); // 4 logos, reached 4 first: rank 2
const dilini = person('Dilini Fernando'); // 4 logos, reached 4 two seconds later: rank 3
const ruwan = person('Ruwan Bandara'); // 3 logos and many repeats: rank 4
const sanduni = person('Sanduni Wickrama'); // 2 logos: rank 5, no prize
const ishara = person('Ishara Jayasuriya'); // 1 logo
const late = person('Late Logo Player'); // two logos delivered out of order
const t0 = Date.now();
await wait(6000);

await scanMany(kasun, 1, 5, t0 + 1000);
await scanMany(nimal, 1, 3, t0 + 1000);
await scanMany(dilini, 1, 3, t0 + 1000);
// Dilini's 4th logo is scanned 2 s after Nimal's, but reaches our API first
const dScan = await scan(dilini, 4, t0 + 4000);
await wait(300);
const nScan = await scan(nimal, 4, t0 + 2000);
check('W1', 'both 4th logos count', dScan === 'counted' && nScan === 'counted', `${dScan} ${nScan}`);
await scanMany(ruwan, 1, 3, t0 + 1000);
const repeats = await Promise.all([1, 2, 3, 1, 2, 3].map((n) => scan(ruwan, n)));
check('W2', 'repeat scans of the same logos never count again', repeats.every((r) => r === 'repeat'), repeats.join(','));
await scanMany(sanduni, 1, 2, t0 + 1000);
await scan(ishara, 1, t0 + 1000);
// Scan time before the session started: does not count in it
const before = await scan(person('Too Early'), 1, minute - 30_000);
check('W3', 'a scan timed before the session started does not count', before === 'no-session', before);
// Out of order: logo 2 scanned at t0+5s arrives first, logo 1 scanned at t0+1s arrives second.
// The player reached 2 logos at t0+5s, not t0+1s.
await scan(late, 2, t0 + 5000);
await wait(300);
await scan(late, 1, t0 + 1000);

let pa = await parts(A);
check('W4', 'most different logos is rank 1', byId(pa, kasun)?.rank === 1 && byId(pa, kasun)?.stalls === 5, JSON.stringify(byId(pa, kasun)));
check('W5', 'a tie goes to the earlier QuickLook scan time, not the order scans arrived', byId(pa, nimal)?.rank === 2 && byId(pa, dilini)?.rank === 3, `Nimal ${byId(pa, nimal)?.rank} Dilini ${byId(pa, dilini)?.rank}`);
check('W6', 'the time a count was reached is the QuickLook scan time', byId(pa, nimal)?.reachedAt?.startsWith(new Date(t0 + 2000).toISOString().slice(0, 19)), `${byId(pa, nimal)?.reachedAt} vs ${new Date(t0 + 2000).toISOString()}`);
check('W7', 'repeats do not move the time a count was reached', byId(pa, ruwan)?.stalls === 3 && byId(pa, ruwan)?.reachedAt?.startsWith(new Date(t0 + 1000).toISOString().slice(0, 19)), JSON.stringify(byId(pa, ruwan)));
const lateP = byId(pa, late);
check('W8', 'logos delivered out of order: the count is reached at the later scan time', lateP?.stalls === 2 && lateP?.reachedAt?.startsWith(new Date(t0 + 5000).toISOString().slice(0, 19)), `${lateP?.stalls} logos, reached ${lateP?.reachedAt}, expected ${new Date(t0 + 5000).toISOString()}`);
let lb = await board();
check('W9', 'the public leaderboard shows the same order', lb.top.slice(0, 3).map((x) => x.name).join() === 'Kasun Silva,Nimal Perera,Dilini Fernando', lb.top.map((x) => x.name).join());

// The end: a scan made just before the end that arrives just after it still counts
const endAt = Date.now();
const lateFinal = endAndFinalize(A);
await wait(200);
const justBefore = await scan(ishara, 2, endAt - 500);
check('W10', 'a scan made before the end but delivered just after it still counts', justBefore === 'counted', justBefore);
let wa = await lateFinal;
const afterEnd = await scan(ishara, 3);
check('W11', 'a scan made after the end does not count', afterEnd === 'no-session', afterEnd);
check('W12', 'winners are worked out when the session ends', wa.session?.finalized === true && wa.items.length === 4, summaryOf(wa));
check('W13', 'the top 4 win, in leaderboard order', summaryOf(wa).startsWith('1:Kasun Silva') && wa.items.map((x) => x.fullName).join() === 'Kasun Silva,Nimal Perera,Dilini Fernando,Ruwan Bandara', summaryOf(wa));
check('W14', 'each rank gets its prize, a rank without a prize gets none', wa.items.map((x) => x.prizeName ?? '-').join() === 'Headset,Pen drive,Mug,-', summaryOf(wa));
check('W15', 'new winners wait for staff (provisional)', wa.items.every((x) => x.status === 'provisional'), summaryOf(wa));
pa = await parts(A);
check('W16', 'the winners are flagged on the participants, nobody else', pa.filter((p) => p.winnerRank).length === 4 && !byId(pa, sanduni)?.winnerRank, JSON.stringify(pa.map((p) => [p.fullName, p.winnerRank ?? null])));
lb = await board();
check('W17', 'the public leaderboard shows no winners before staff confirm', (lb.winners ?? []).length === 0, JSON.stringify(lb.winners));

// ---------- Staff: confirm, disqualify, collect ----------
const R = (rank, action) => su.call('POST', `${H}/sessions/${A.sessionId}/winners/${rank}/${action}`);
expectStatus('W18', 'collecting a prize before the winner is confirmed is refused', await R(1, 'collect'), 409, 'CANNOT_COLLECT');
expectStatus('W19', 'confirm rank 1', await R(1, 'confirm'), 200);
lb = await board();
check('W20', 'the public leaderboard shows the confirmed winner only', lb.winners?.length === 1 && lb.winners[0].name === 'Kasun Silva' && lb.winners[0].prizeName === 'Headset', JSON.stringify(lb.winners));
expectStatus('W21', 'disqualify rank 2', await R(2, 'disqualify'), 200);
wa = await winnersOf(A);
check('W22', 'everyone below moves up one rank and takes that rank\'s prize', wa.items.map((x) => `${x.fullName}:${x.prizeName ?? '-'}`).join() === 'Kasun Silva:Headset,Dilini Fernando:Pen drive,Ruwan Bandara:Mug,Sanduni Wickrama:-', summaryOf(wa));
check('W23', 'the confirmed winner keeps the place and stays confirmed', wa.items[0].fullName === 'Kasun Silva' && wa.items[0].status === 'confirmed', summaryOf(wa));
pa = await parts(A);
check('W24', 'the disqualified player has no rank and no winner flag', byId(pa, nimal)?.rank === null && !byId(pa, nimal)?.winnerRank, JSON.stringify(byId(pa, nimal)));
lb = await board();
check('W25', 'the disqualified player is off the public leaderboard', !lb.top.some((x) => x.name === 'Nimal Perera'), lb.top.map((x) => x.name).join());
expectStatus('W26', 'collect rank 1', await R(1, 'collect'), 200);
expectStatus('W27', 'collecting the same prize twice is refused', await R(1, 'collect'), 409, 'CANNOT_COLLECT');
expectStatus('W28', 'a winner who collected cannot be disqualified', await R(1, 'disqualify'), 409, 'ALREADY_COLLECTED');
expectStatus('W29', 'a rank with no winner is not found', await R(9, 'disqualify'), 404, 'WINNER_NOT_FOUND');
expectStatus('W30', 'confirm the new rank 2 (Dilini)', await R(2, 'confirm'), 200);
const desk = (await su.call('GET', `${H}/winners?date=${today}`)).data.items;
check('W31', 'the prize desk lists the confirmed winners of the day only', desk.map((x) => x.fullName).sort().join() === 'Dilini Fernando,Kasun Silva', JSON.stringify(desk.map((x) => [x.fullName, x.status])));
expectStatus('W32', 'an ended session cannot be started again', await su.call('POST', `${H}/sessions/${A.sessionId}/start`), 409, 'ALREADY_ENDED');

// ---------- Session B: previous winners of the day are skipped ----------
expectStatus('W33', 'start session B early', await su.call('POST', `${H}/sessions/${B.sessionId}/start`), 200);
await wait(6000);
const t1 = Date.now();
await scanMany(kasun, 1, 6, t1); // confirmed winner of A: most logos again
await scanMany(dilini, 1, 5, t1); // confirmed winner of A
await scanMany(ruwan, 1, 4, t1); // only provisional in A (never confirmed): can win
await scanMany(nimal, 1, 3, t1); // disqualified in A: a new session, a clean start
await scanMany(sanduni, 1, 1, t1);
const pb = await parts(B);
check('W34', 'points start again in a new session (6 logos, 20 points each)', byId(pb, kasun)?.stalls === 6 && byId(pb, kasun)?.points === 120, JSON.stringify(byId(pb, kasun)));
check('W35', 'being disqualified in A does not carry over to B', byId(pb, nimal)?.rank === 4 && byId(pb, nimal)?.disqualified === false, JSON.stringify(byId(pb, nimal)));
lb = await board();
check('W36', 'a previous winner still shows on the leaderboard by points', lb.top[0]?.name === 'Kasun Silva', lb.top.map((x) => x.name).join());
const wb = await endAndFinalize(B);
check('W37', 'confirmed winners of earlier sessions that day are skipped as winners', wb.items.map((x) => x.fullName).join() === 'Ruwan Bandara,Nimal Perera', summaryOf(wb));
check('W38', 'a winner who was never confirmed can still win later that day', wb.items[0]?.fullName === 'Ruwan Bandara' && wb.items[0]?.prizeName === 'Umbrella', summaryOf(wb));

// Changing an ended session's winner count works the winners out again
const edit = await su.call('PUT', `${H}/sessions/${B.sessionId}`, { name: B.name, date: today, start: hhmm(Date.parse(B.startsAt)), end: hhmm(Date.parse(B.endsAt)), pointsPerStall: 20, winnersCount: 3, prizes: B.prizes, allowPreviousWinners: false });
const wb2 = await winnersOf(B);
check('W39', 'raising the winner count after the end adds the next eligible player', edit.status === 200 && wb2.items.map((x) => x.fullName).join() === 'Ruwan Bandara,Nimal Perera,Sanduni Wickrama', `${edit.status} ${summaryOf(wb2)}`);

// ---------- Session C: previous winners allowed, fewer players than prizes ----------
expectStatus('W40', 'start session C early', await su.call('POST', `${H}/sessions/${C.sessionId}/start`), 200);
await wait(6000);
await scanMany(kasun, 1, 2);
await wait(50);
await scan(person('Only One Logo'), 1);
const wc = await endAndFinalize(C);
check('W41', 'when previous winners are allowed, they can win again', wc.items[0]?.fullName === 'Kasun Silva', summaryOf(wc));
check('W42', 'fewer players than winners: only the players there win', wc.items.length === 2, summaryOf(wc));
const empty = await su.call('GET', `${H}/sessions/${A.sessionId}/winners`);
check('W43', 'session A is unchanged by later sessions', empty.data.items.map((x) => x.fullName).join() === 'Kasun Silva,Dilini Fernando,Ruwan Bandara,Sanduni Wickrama', summaryOf(empty.data));

summary();
