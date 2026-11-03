// QA session 3: Treasure Hunt on QuickLook's Leaderboard API (the QuickLook mock on port 4010).
// Scans are added to the mock leaderboard, the hunt reads them (every 5 seconds locally, or at once
// with "read now"), and the progress, leaderboard and winners follow.
import { createHash } from 'node:crypto';
import { HUNT, adminAs, check, expectStatus, person, summary, wait } from './lib.mjs';

const MOCK = 'http://localhost:4010';
const H = `${HUNT}/admin/v1/hunt`;
const logo = (n) => `0b6f2a10-1c1e-4a61-9a01-00000000000${n}`;
const mock = (path, body) =>
  fetch(`${MOCK}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
// Test players: the platform turns a test token into this QuickLook user ID (mock mode)
const userIdOf = (v) => `ql_test_${createHash('sha256').update(v.token).digest('hex').slice(0, 16)}`;
const scanAs = (v, name, n) => mock('/_mock/leaderboard/scans', { userId: userIdOf(v), fullName: name, mobile: '0771234567', logoId: logo(n) });

const su = await adminAs();
const status = (await su.call('GET', `${HUNT}/hunt/v1/status`)).data;
const session = status.session;
check('H0', 'a hunt session is open', session?.state === 'open', JSON.stringify(status));
const S = `${H}/sessions/${session.sessionId}`;
const fullSession = (await su.call('GET', `${H}/sessions`)).data.items.find((s) => s.sessionId === session.sessionId);
check('H0b', 'the session has the 8 mock QuickLook logos selected', fullSession?.logos?.length === 8, JSON.stringify(fullSession?.logos?.length));
await mock('/_mock/leaderboard/reset');
const readNow = () => su.call('POST', `${S}/sync`);

// Three players sign in (any logo scan signs a test player in), then scan stall logos in QuickLook
const a = await person();
const b = await person();
const c = await person();
for (const v of [a, b, c]) await v.scan('logo_game_spin');
await scanAs(a, 'Amal Perera', 1);
await scanAs(a, 'Amal Perera', 2);
await scanAs(a, 'Amal Perera', 1); // the same logo again
await mock('/_mock/leaderboard/scans', { userId: userIdOf(a), fullName: 'Amal Perera', mobile: '0771234567', logoId: '0b6f2a10-1c1e-4a61-9a01-000000000009' }); // not an event logo
await scanAs(b, 'Bimali Silva', 3);
await scanAs(b, 'Bimali Silva', 4);
await scanAs(b, 'Bimali Silva', 5);
await scanAs(c, 'Chathura Dias', 6);
await wait(20);
await scanAs(c, 'Chathura Dias', 7); // c reaches 2 stalls after a did
expectStatus('H1', 'admin reads the standings from QuickLook now', await readNow(), 200);

const meA = (await a.call('GET', `${HUNT}/hunt/v1/me`)).data;
check('H2', 'a repeated logo and a logo outside the event do not count (2 stalls)', meA?.player?.stalls === 2 && meA.player.points === 2 * session.pointsPerStall, JSON.stringify(meA?.player));
check('H3', 'my progress lists the logos found by name', meA?.visits?.length === 2 && meA.visits[0].name === 'Lanka Fibre Broadband', JSON.stringify(meA?.visits));
const meB = (await b.call('GET', `${HUNT}/hunt/v1/me`)).data;
check('H4', 'the player with the most stalls is rank 1', meB?.player?.rank === 1 && meB.player.stalls === 3, JSON.stringify(meB?.player));
const meC = (await c.call('GET', `${HUNT}/hunt/v1/me`)).data;
check('H5', 'a tie goes to whoever reached the count first', meA?.player?.rank === 2 && meC?.player?.rank === 3, `${meA?.player?.rank} ${meC?.player?.rank}`);

const lb = (await a.call('GET', `${HUNT}/hunt/v1/leaderboard`)).data;
check('H6', 'leaderboard is in rank order with the stall count', lb.top?.[0]?.stalls === 3 && lb.top.map((r) => r.rank).join() === '1,2,3', JSON.stringify(lb.top));
check('H7', 'public leaderboard shows player numbers only (no names, phones or user IDs)', !/ql_test|Amal|Bimali|0771234567|userId/.test(JSON.stringify(lb)), JSON.stringify(lb).slice(0, 300));
const parts = (await su.call('GET', `${S}/participants`)).data.items;
check('H8', 'admin sees names and mobile numbers', parts.some((p) => p.fullName === 'Bimali Silva' && p.mobile === '0771234567'), JSON.stringify(parts[0]).slice(0, 200));
const live = (await su.call('GET', `${S}/live`)).data;
check('H9', 'the last read from QuickLook is shown without errors', Boolean(live.sync?.lastSyncAt) && live.sync.error === null && live.players === 3, JSON.stringify(live.sync));

// Logo selection: QuickLook search, and only selected logos count
const found = (await su.call('GET', `${H}/quicklook-logos?name=lanka`)).data;
check('H10', 'admin can search QuickLook logos by name', found?.items?.length === 1 && found.items[0].logoCode === 'QL-0101', JSON.stringify(found).slice(0, 200));
const fewer = fullSession.logos.filter((l) => ![logo(3), logo(4)].includes(l.logoId));
expectStatus('H11', 'deselect two logos', await su.call('PUT', `${S}/logos`, { logos: fewer }), 200);
const meB2 = (await b.call('GET', `${HUNT}/hunt/v1/me`)).data;
check('H12', 'scans of deselected logos no longer count', meB2?.player?.stalls === 1, JSON.stringify(meB2?.player));
expectStatus('H13', 'select them again', await su.call('PUT', `${S}/logos`, { logos: fullSession.logos }), 200);
expectStatus('H14', 'a logo selected twice is refused', await su.call('PUT', `${S}/logos`, { logos: [fullSession.logos[0], fullSession.logos[0]] }), 400);

// The end: scans after it do not count, winners come from the final read
expectStatus('H15', 'end the session early', await su.call('POST', `${S}/end`), 200);
await wait(1000);
await scanAs(c, 'Chathura Dias', 8);
await scanAs(c, 'Chathura Dias', 1);
let winners = [];
for (let i = 0; i < 10 && winners.length === 0; i++) {
  await wait(2000);
  winners = (await su.call('GET', `${S}/winners`)).data?.items ?? [];
}
check('H16', 'winners are worked out after the end, with name and mobile', winners.length === 3 && winners[0].fullName === 'Bimali Silva' && winners[0].mobile === '0771234567', JSON.stringify(winners.map((w) => [w.rank, w.fullName, w.stalls])));
check('H17', 'scans after the end did not count', winners.find((w) => w.fullName === 'Chathura Dias')?.stalls === 2, JSON.stringify(winners.map((w) => [w.fullName, w.stalls])));
if (winners.length) {
  const first = winners[0];
  expectStatus('H18', 'collecting before confirming is refused', await su.call('POST', `${S}/winners/1/collect`), 409, 'CANNOT_COLLECT');
  expectStatus('H19', 'disqualify rank 1', await su.call('POST', `${S}/winners/1/disqualify`), 200);
  const after = (await su.call('GET', `${S}/winners`)).data?.items ?? [];
  check('H20', 'next player moves up to rank 1', after[0] && after[0].userId !== first.userId, JSON.stringify(after.map((w) => [w.rank, w.playerNumber])));
  expectStatus('H21', 'confirm the new rank 1', await su.call('POST', `${S}/winners/1/confirm`), 200);
  expectStatus('H22', 'collect rank 1', await su.call('POST', `${S}/winners/1/collect`), 200);
  expectStatus('H23', 'collect rank 1 twice is refused', await su.call('POST', `${S}/winners/1/collect`), 409);
  const view = (await su.call('GET', `${HUNT}/hunt/v1/leaderboard`)).data;
  check('H24', 'leaderboard shows winners after the end', (view.winners?.length ?? 0) > 0, JSON.stringify(view).slice(0, 300));
  expectStatus('H25', 'a finalized session cannot be started again', await su.call('POST', `${S}/start`), 409, 'ALREADY_ENDED');
  expectStatus('H26', 'logos of a finalized session cannot change', await su.call('PUT', `${S}/logos`, { logos: [] }), 409, 'SESSION_FINALIZED');
}

// Next session rules
const all = (await su.call('GET', `${H}/sessions?date=${session.startsAt.slice(0, 10)}`)).data.items;
const next = all.find((s) => s.status === 'scheduled');
if (next) expectStatus('H27', 'start the next session early once nothing runs', await su.call('POST', `${H}/sessions/${next.sessionId}/start`), 200);
const bad = await su.call('POST', `${H}/sessions`, { name: 'QA', date: '2026-13-45', start: '09:00', end: '10:00', pointsPerStall: 10, winnersCount: 3, prizes: [], allowPreviousWinners: false });
check('H28', 'invalid hunt date is refused', bad.status === 400, `got ${bad.status}`);
if (bad.status === 201) await su.call('DELETE', `${H}/sessions/${bad.data.sessionId}`);

summary();
