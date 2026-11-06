// QA session 2: admin dashboard APIs
import { adminAs, check, client, expectStatus, GAMES, HUNT, person, PLATFORM, qaPhone, summary } from './lib.mjs';

const G = `${GAMES}/admin/v1/games`;
const su = await adminAs();
const today = (await su.call('GET', `${GAMES}/games/v1/status`)).data.serverTime.slice(0, 10);
const pw = `Qa-${crypto.randomUUID().slice(0, 12)}!`;
const stamp = Date.now().toString(36);

// R: roles
for (const role of ['viewer', 'prize-desk', 'games-admin', 'hunt-admin']) {
  const r = await su.call('POST', `${PLATFORM}/admin/v1/users`, { username: `qa.${role}.${stamp}`, role, password: pw });
  expectStatus(`R0-${role}`, `create ${role} user`, r, 201);
}
const viewer = await adminAs(`qa.viewer.${stamp}`, pw);
const desk = await adminAs(`qa.prize-desk.${stamp}`, pw);
const gamesAdmin = await adminAs(`qa.games-admin.${stamp}`, pw);
const huntAdmin = await adminAs(`qa.hunt-admin.${stamp}`, pw);
expectStatus('R1', 'viewer can read sessions', await viewer.call('GET', `${G}/sessions`), 200);
expectStatus('R2', 'viewer cannot create a prize', await viewer.call('POST', `${G}/prizes`, { name: 'x', stock: 1, isMainPrize: false, imageKey: null }), 403);
expectStatus('R3', 'viewer cannot pause a game', await viewer.call('PUT', `${G}/games/spin/status`, { paused: true }), 403);
expectStatus('R4', 'prize desk cannot change settings', await desk.call('PUT', `${G}/settings`, { lockTimeoutSeconds: 60, repeatWinnerRule: false, unusedPrizes: 'expire' }), 403);
expectStatus('R5', 'hunt admin cannot change games allocations', await huntAdmin.call('PUT', `${G}/sessions/x/allocation`, { rows: [] }), 403);
expectStatus('R6', 'games admin cannot create admin users', await gamesAdmin.call('POST', `${PLATFORM}/admin/v1/users`, { username: `qa.x.${stamp}`, role: 'viewer', password: pw }), 403);
expectStatus('R7', 'games admin cannot create hunt sessions', await gamesAdmin.call('POST', `${HUNT}/admin/v1/hunt/sessions`, {}), 403);
expectStatus('R8', 'no cookie gets 401', await client({ 'x-lkdr-admin': '1' }).call('GET', `${G}/sessions`), 401);
expectStatus('R9', 'super admin cannot disable itself', await su.call('PUT', `${PLATFORM}/admin/v1/users/super.admin`, { disabled: true }), 409);
expectStatus('R9b', 'admin request without the x-lkdr-admin header (CSRF guard)', await client().call('GET', `${G}/sessions`), 403);

// S: sessions
const mk = (body) => gamesAdmin.call('POST', `${G}/sessions`, { name: 'QA', date: '2026-12-01', games: ['spin'], ...body });
const sA = await mk({ start: '09:00', end: '10:00' });
expectStatus('S1', 'create a session', sA, 201);
expectStatus('S2', 'overlapping session is refused', await mk({ start: '09:30', end: '10:30' }), 409, 'SESSION_OVERLAP');
expectStatus('S3', 'touching session (10:00 start) is allowed', await mk({ start: '10:00', end: '11:00' }), 201);
expectStatus('S4', 'end before start is refused', await mk({ start: '12:00', end: '11:00' }), 400);
expectStatus('S5', 'invalid time is refused', await mk({ start: '25:00', end: '26:00' }), 400);
expectStatus('S6', 'no games is refused', await mk({ start: '13:00', end: '14:00', games: [] }), 400);
expectStatus('S7', 'invalid date is refused', await mk({ date: '2026-13-45', start: '13:00', end: '14:00' }), 400);
expectStatus('S8', 'delete a session without plays', await gamesAdmin.call('DELETE', `${G}/sessions/${sA.data.sessionId}`), 204);
const running = (await su.call('GET', `${G}/sessions?date=${today}`)).data.items.find((s) => s.status === 'open');
expectStatus('S9', 'delete a session with plays is refused', await gamesAdmin.call('DELETE', `${G}/sessions/${running.sessionId}`), 409, 'SESSION_HAS_PLAYS');
const startTime = running.startsAt.slice(11, 16);
const endTime = running.endsAt.slice(11, 16);
expectStatus('S10', 'moving a running session to another day is refused', await gamesAdmin.call('PUT', `${G}/sessions/${running.sessionId}`, { name: running.name, date: '2026-12-02', start: startTime, end: endTime, games: running.games }), 409, 'SESSION_STARTED');
expectStatus('S11', 'unknown session ID gives 404', await gamesAdmin.call('GET', `${G}/sessions/ses_nope/allocation`), 404);
const past = await mk({ date: '2020-01-01', start: '09:00', end: '10:00' });
expectStatus('S12', 'creating a session in the past is refused', past, 422, 'SESSION_IN_PAST');
if (past.status === 201) await gamesAdmin.call('DELETE', `${G}/sessions/${past.data.sessionId}`);

// P: prizes and allocation
const prize = await gamesAdmin.call('POST', `${G}/prizes`, { name: 'QA prize', stock: 5, isMainPrize: false, imageKey: null });
expectStatus('P1', 'create a prize', prize, 201);
const pid = prize.data.prizeId;
expectStatus('P2', 'negative stock is refused', await gamesAdmin.call('POST', `${G}/prizes`, { name: 'bad', stock: -1, isMainPrize: false, imageKey: null }), 400);
expectStatus('P3', 'empty name is refused', await gamesAdmin.call('POST', `${G}/prizes`, { name: '', stock: 1, isMainPrize: false, imageKey: null }), 400);
const allocSave = (sid, n) => gamesAdmin.call('PUT', `${G}/sessions/${sid}/allocation`, { rows: [{ game: 'spin', prizeId: pid, allocated: n }] });
expectStatus('P4', 'allocate 3 of 5', await allocSave(running.sessionId, 3), 200);
expectStatus('P5', 'allocating above stock is refused', await allocSave(running.sessionId, 6), 409, 'ALLOCATION_INVALID');
expectStatus('P6', 'lowering stock below allocated is refused', await gamesAdmin.call('PUT', `${G}/prizes/${pid}`, { name: 'QA prize', stock: 2, isMainPrize: false, imageKey: null }), 409);
expectStatus('P7', 'deleting an allocated prize is refused', await gamesAdmin.call('DELETE', `${G}/prizes/${pid}`), 409, 'PRIZE_ALLOCATED');
expectStatus('P8', 'allocating to a game the session does not run', await gamesAdmin.call('PUT', `${G}/sessions/${running.sessionId}/allocation`, { rows: [{ game: 'lucky-dip', prizeId: pid, allocated: 0 }] }), 200);
const tomorrow = (await su.call('GET', `${G}/sessions`)).data.items.find((s) => s.status === 'scheduled' && !s.games.includes('lucky-dip'));
if (tomorrow) {
  const r = await gamesAdmin.call('PUT', `${G}/sessions/${tomorrow.sessionId}/allocation`, { rows: [{ game: 'lucky-dip', prizeId: pid, allocated: 1 }] });
  check('P9', "allocating to a game the session doesn't include is refused", r.status === 409 || r.status === 422, `got ${r.status}`);
}
const unknownPrize = await gamesAdmin.call('PUT', `${G}/sessions/${running.sessionId}/allocation`, { rows: [{ game: 'spin', prizeId: 'prz_nope', allocated: 1 }] });
expectStatus('P10', 'allocating an unknown prize is refused', unknownPrize, 422, 'PRIZE_NOT_FOUND');
const autoSplit = await gamesAdmin.call('POST', `${G}/allocations/auto-split`, { date: today, game: 'spin', totals: { [pid]: 5 }, method: 'equal', apply: false });
check('P11', 'auto-split preview adds up to the total', autoSplit.status === 200 && Object.values(autoSplit.data.split[pid]).reduce((a, b) => a + b, 0) === 5, JSON.stringify(autoSplit.data));
const neg = await gamesAdmin.call('PUT', `${G}/sessions/${running.sessionId}/allocation`, { rows: [{ game: 'spin', prizeId: pid, allocated: -1 }] });
expectStatus('P12', 'negative allocation is refused', neg, 400);
await allocSave(running.sessionId, 0);
expectStatus('P13', 'delete the prize once unallocated', await gamesAdmin.call('DELETE', `${G}/prizes/${pid}`), 204);

// D: prize desk
const winner = await person();
let won = null;
let spinWin = null; // { reference, name, phone } of a Spin the Wheel win, for the name search
const phones = []; // every full number used, none may appear in the CSV
const phoneOf = new Map(); // reference: the phone it was won with
const masked = (n) => `${n.slice(0, 3)}****${n.slice(-3)}`;
for (let i = 0; i < 6 && !(won && spinWin); i++) {
  const v = await person();
  const e = await v.enter(i % 2 ? 'logo_game_dip' : 'logo_game_spin');
  if (e.status !== 201) continue;
  const name = `QA Desk Player ${Date.now().toString(36)}${i}`;
  const phone = qaPhone();
  phones.push(phone);
  const p = await v.call('POST', `${GAMES}/games/v1/entries/${e.data.entryId}/play`, { player: { name, phone } });
  await su.call('POST', `${G}/screens/${i % 2 ? 'scr_dip' : 'scr_spin'}/release-lock`);
  const reference = p.data?.result?.reference;
  if (reference) phoneOf.set(reference, phone);
  if (reference && !(i % 2) && !spinWin) spinWin = { reference, name, phone };
  else if (reference && !won) won = reference;
}
if (spinWin) {
  const found = await desk.call('GET', `${G}/references?q=${encodeURIComponent(spinWin.name.slice(3).toLowerCase())}`);
  const hit = found.data?.items?.find((r) => r.reference === spinWin.reference);
  check('D8', 'desk finds a Spin prize by part of the player name, with name and phone', Boolean(hit && hit.player?.name === spinWin.name && hit.player?.phone === spinWin.phone), JSON.stringify(found.data).slice(0, 300));
  const byRef = await desk.call('GET', `${G}/references?q=${encodeURIComponent(spinWin.reference)}`);
  check('D9', 'the same search box finds a reference ID', byRef.data?.items?.[0]?.reference === spinWin.reference, JSON.stringify(byRef.data).slice(0, 200));
  won ??= spinWin.reference;
}
void winner;
check('D0', 'a test play won a prize reference', Boolean(won), 'no prize won in 6 plays');
if (won) {
  const typed = won.toLowerCase().replaceAll('-', ' ');
  expectStatus('D1', 'desk finds a reference typed in lower case with spaces', await desk.call('GET', `${G}/references/${encodeURIComponent(typed)}`), 200);
  expectStatus('D2', 'viewer can look up but not collect', await viewer.call('POST', `${G}/references/${won}/collect`), 403);
  expectStatus('D3', 'desk collects the prize', await desk.call('POST', `${G}/references/${won}/collect`), 200);
  expectStatus('D4', 'collecting twice is refused', await desk.call('POST', `${G}/references/${won}/collect`), 409);
  const looked = await desk.call('GET', `${G}/references/${won}`);
  check('D5', 'lookup shows who collected and when', Boolean(looked.data?.collectedAt && looked.data?.collectedBy), JSON.stringify(looked.data).slice(0, 200));
}
// E: plays report and CSV export (name, masked phone, collection status)
if (won) {
  const report = await viewer.call('GET', `${G}/reports/plays?sessionId=${running.sessionId}`);
  const row = report.data?.items?.find((r) => r.reference === won);
  check('E1', 'plays report shows the name, the masked phone and who collected', Boolean(row && row.name.startsWith('QA Desk Player') && row.phone === masked(phoneOf.get(won) ?? '') && row.collectedAt && row.collectedBy), JSON.stringify(row ?? report.data).slice(0, 300));
  const csv = await viewer.call('GET', `${G}/reports/plays?sessionId=${running.sessionId}&format=csv`);
  const text = typeof csv.data === 'string' ? csv.data : '';
  const line = text.split('\r\n').find((l) => l.includes(won)) ?? '';
  check('E2', 'CSV export has the columns and the collected prize row', csv.status === 200 && text.includes('"Played at (Colombo)","Game","Name","Phone","QuickLook user ID","Prize","Reference","Collected"') && line.includes(`"${masked(phoneOf.get(won) ?? '')}"`) && line.includes('"Yes"'), `${csv.status} ${text.slice(0, 200)}`);
  check('E3', 'CSV export never has a full phone number', !phones.some((n) => text.includes(n)), 'full number found');
  const noHeader = await fetch(`${G}/reports/plays?sessionId=${running.sessionId}&format=csv`, { headers: { cookie: [...viewer.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
  check('E4', 'CSV export without the admin header is refused (cross-site guard)', noHeader.status === 403, `got ${noHeader.status}`);
  expectStatus('E5', 'prize desk cannot export the plays', await desk.call('GET', `${G}/reports/plays?sessionId=${running.sessionId}&format=csv`), 403);
}
expectStatus('D6', 'malformed reference finds nothing', await desk.call('GET', `${G}/references/HELLO`), 404);
expectStatus('D7', 'unknown reference', await desk.call('GET', `${G}/references/LKD-AAAA-22`), 404);

// T: settings
const base = (await su.call('GET', `${G}/settings`)).data;
const put = (patch) => su.call('PUT', `${G}/settings`, { lockTimeoutSeconds: base.lockTimeoutSeconds, repeatWinnerRule: base.repeatWinnerRule, unusedPrizes: base.unusedPrizes, ...patch });
expectStatus('T1', 'lock timeout below 20 s is refused', await put({ lockTimeoutSeconds: 5 }), 400);
expectStatus('T2', 'unknown unused-prizes value is refused', await put({ unusedPrizes: 'burn' }), 400);
const t3 = await put({ lockTimeoutSeconds: 61 });
const after = (await su.call('GET', `${G}/settings`)).data;
check('T3', 'saving settings keeps the paused flags', t3.status === 200 && JSON.stringify(after.paused) === JSON.stringify(base.paused), JSON.stringify(after));
await put({});

// G: a game with prizes cannot be removed from a session
const both = await gamesAdmin.call('POST', `${G}/sessions`, { name: 'QA both', date: '2026-12-03', start: '09:00', end: '10:00', games: ['spin', 'lucky-dip'] });
const qp = await gamesAdmin.call('POST', `${G}/prizes`, { name: 'QA prize 2', stock: 3, isMainPrize: false, imageKey: null });
await gamesAdmin.call('PUT', `${G}/sessions/${both.data.sessionId}/allocation`, { rows: [{ game: 'lucky-dip', prizeId: qp.data.prizeId, allocated: 2 }] });
expectStatus('G1', 'removing a game that still has prizes is refused', await gamesAdmin.call('PUT', `${G}/sessions/${both.data.sessionId}`, { name: 'QA both', date: '2026-12-03', start: '09:00', end: '10:00', games: ['spin'] }), 409, 'GAME_HAS_PRIZES');
await gamesAdmin.call('PUT', `${G}/sessions/${both.data.sessionId}/allocation`, { rows: [{ game: 'lucky-dip', prizeId: qp.data.prizeId, allocated: 0 }] });
expectStatus('G2', 'after setting it to 0 the game can be removed', await gamesAdmin.call('PUT', `${G}/sessions/${both.data.sessionId}`, { name: 'QA both', date: '2026-12-03', start: '09:00', end: '10:00', games: ['spin'] }), 200);
await gamesAdmin.call('DELETE', `${G}/sessions/${both.data.sessionId}`);
await gamesAdmin.call('DELETE', `${G}/prizes/${qp.data.prizeId}`);

// C: a role change applies without signing in again
await su.call('PUT', `${PLATFORM}/admin/v1/users/qa.prize-desk.${stamp}`, { role: 'viewer' });
await new Promise((r) => setTimeout(r, 16_000));
expectStatus('C1', 'prize desk changed to viewer can no longer collect', await desk.call('POST', `${G}/references/LKD-AAAA-22/collect`), 403);

// L: login security
const bad = client({ 'x-lkdr-admin': '1' });
const tries = [];
for (let i = 0; i < 6; i++) tries.push((await bad.call('POST', `${PLATFORM}/admin/v1/auth/login`, { username: `qa.viewer.${stamp}`, password: 'wrong' })).status);
check('L1', 'repeated wrong passwords lock the account', tries.includes(423), tries.join(','));
const lockedGood = await adminAs(`qa.viewer.${stamp}`, pw);
expectStatus('L2', 'locked account refuses even the right password', lockedGood.loginResult, 423);
expectStatus('L3', 'super admin unlocks it', await su.call('PUT', `${PLATFORM}/admin/v1/users/qa.viewer.${stamp}`, { unlock: true }), 200);
expectStatus('L4', 'login works after unlock', (await adminAs(`qa.viewer.${stamp}`, pw)).loginResult, 200);
expectStatus('L5', 'unknown user and wrong password give the same answer', await bad.call('POST', `${PLATFORM}/admin/v1/auth/login`, { username: 'nobody.here', password: 'x' }), 401);
await su.call('PUT', `${PLATFORM}/admin/v1/users/qa.games-admin.${stamp}`, { disabled: true });
await new Promise((r) => setTimeout(r, 16_000)); // accounts are cached for up to 15 s
expectStatus('L6', 'a disabled user is signed out on the next request', await gamesAdmin.call('GET', `${G}/sessions`), 401);
await gamesAdmin.call('POST', `${PLATFORM}/admin/v1/auth/logout`);
expectStatus('L7', 'after logout the old cookie no longer works', await desk.call('POST', `${PLATFORM}/admin/v1/auth/logout`).then(() => desk.call('GET', `${PLATFORM}/admin/v1/auth/me`)), 401);

summary();
