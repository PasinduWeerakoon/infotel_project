// QA session 6: every play wins (project document), and main prizes are spread across a real
// (short) session instead of going to the first players. Shrinks the running local session to
// 6 minutes, gives Spin 30 QA chocolates and 4 QA main prizes, then sends a player every
// 10 seconds (36 players for 34 prizes). Starts and ends with a reset, so other sessions are not affected.
import { execFileSync } from 'node:child_process';
import { GAMES, adminAs, check, expectStatus, person, summary, wait } from './lib.mjs';

const reset = () => execFileSync('node', [new URL('./reset-local.mjs', import.meta.url).pathname], { stdio: 'ignore' });
const LENGTH_MIN = 6;
const G = `${GAMES}/admin/v1/games`;

const colombo = (d) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${v.year}-${v.month}-${v.day}`, time: `${v.hour}:${v.minute}` };
};

reset();
// Start on a minute boundary, so the session is exactly 6 minutes long
await wait(60_000 - (Date.now() % 60_000) + 500);
const startedAt = Date.now();
const from = colombo(new Date(startedAt));
const to = colombo(new Date(startedAt + LENGTH_MIN * 60_000));
if (to.date !== from.date) {
  console.log('SKIP  6  too close to midnight for a 6 minute session');
  process.exit(0);
}

const su = await adminAs();
const session = (await su.call('GET', `${GAMES}/games/v1/status`)).data.session;
expectStatus('S0', 'shrink the running session to 6 minutes', await su.call('PUT', `${G}/sessions/${session.sessionId}`, { name: 'QA spread', date: from.date, start: from.time, end: to.time, games: session.games }), 200);

// Spin gives exactly 30 QA chocolates and 4 QA main prizes in this session, nothing else
const FILLER = 30;
const MAIN = 4;
const filler = (await su.call('POST', `${G}/prizes`, { name: 'QA chocolate', stock: FILLER, isMainPrize: false, imageKey: null })).data;
const main = (await su.call('POST', `${G}/prizes`, { name: 'QA main prize', stock: MAIN, isMainPrize: true, imageKey: null })).data;
const rows = (await su.call('GET', `${G}/sessions/${session.sessionId}/allocation`)).data.rows.filter((r) => r.game === 'spin');
const zeroed = rows.map((r) => ({ game: 'spin', prizeId: r.prizeId, allocated: 0 }));
const qaRows = [{ game: 'spin', prizeId: filler.prizeId, allocated: FILLER }, { game: 'spin', prizeId: main.prizeId, allocated: MAIN }];
expectStatus('S1', 'allocate 30 QA chocolates and 4 QA main prizes to Spin', await su.call('PUT', `${G}/sessions/${session.sessionId}/allocation`, { rows: [...zeroed, ...qaRows] }), 200);

console.log(`      playing for ${LENGTH_MIN} minutes, one player every 10 seconds...`);
const plays = [];
const problems = [];
while (Date.now() < startedAt + LENGTH_MIN * 60_000 - 5_000) {
  const tick = Date.now();
  const v = await person();
  const e = await v.enter('logo_game_spin');
  if (e.status === 409 && e.code === 'NO_PRIZES_LEFT') {
    plays.push({ at: tick - startedAt, soldOut: true });
  } else if (e.status !== 201) {
    problems.push(`entry ${e.status} ${e.code}`);
  } else {
    const p = await v.call('POST', `${GAMES}/games/v1/entries/${e.data.entryId}/play`, { player: { name: 'QA Player', phone: '0771234567' } });
    const r = p.data?.result;
    const segment = p.data?.display?.segments?.[r?.animation?.target]?.id;
    if (p.status !== 200 || !r?.prize || segment !== r.prize.prizeId) problems.push(`play ${p.status} ${segment}`);
    if (p.data?.display?.segments?.some((x) => x.id === 'try-again')) problems.push('wheel has a try again segment');
    plays.push({ at: tick - startedAt, won: Boolean(r?.prize), main: r?.prize?.prizeId === main.prizeId, reference: r?.reference });
    await su.call('POST', `${G}/screens/scr_spin/release-lock`);
  }
  await wait(Math.max(0, 10_000 - (Date.now() - tick)));
}

const wins = plays.filter((p) => p.won);
const mains = wins.filter((p) => p.main);
const minute = (p) => Math.floor(p.at / 60_000);
const mainPerMinute = Array.from({ length: LENGTH_MIN }, (_, m) => mains.filter((p) => minute(p) === m).length);
const played = plays.filter((p) => !p.soldOut);
console.log(`      ${plays.length} players, ${wins.length} prizes, main prizes per minute: ${mainPerMinute.join(' ')}`);

check('S2', 'every play won a prize and the wheel stopped on it (no try again)', problems.length === 0, problems.join(', '));
check('S3', 'every player before the stock ran out got a prize', played.length > 0 && played.every((p) => p.won), `${played.filter((p) => !p.won).length} without a prize`);
check('S4', 'all 34 prizes were given', wins.length === FILLER + MAIN, `${wins.length} given`);
check('S5', 'main prizes did not all go to the first players (at most 2 in the first 10)', plays.slice(0, 10).filter((p) => p.main).length <= 2, plays.slice(0, 10).map((p) => (p.main ? 'M' : p.won ? 'c' : '.')).join(''));
check('S6', 'main prizes are spread: each half of the session got at least 1', mainPerMinute.slice(0, 3).reduce((a, b) => a + b, 0) >= 1 && mainPerMinute.slice(3).reduce((a, b) => a + b, 0) >= 1, mainPerMinute.join(' '));
check('S7', 'every prize has its own reference', new Set(wins.map((w) => w.reference)).size === wins.length, '');
const alloc = (await su.call('GET', `${G}/sessions/${session.sessionId}/allocation`)).data.rows.filter((r) => r.game === 'spin' && r.allocated > 0);
check('S8', 'the allocation shows everything given, nothing left (never more than the stock)', alloc.every((r) => r.given === r.allocated && r.remaining === 0), JSON.stringify(alloc));
const lastWin = Math.max(...wins.map((w) => w.at));
const afterLast = plays.filter((p) => p.at > lastWin);
check('S9', 'once all are given, the next scans get NO_PRIZES_LEFT', afterLast.length > 0 && afterLast.every((p) => p.soldOut), `${afterLast.length} players after the last prize, ${afterLast.filter((p) => p.soldOut).length} told sold out`);
reset();
summary();
