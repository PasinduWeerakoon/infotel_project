import { GAMES, HUNT, adminAs, expectStatus, summary } from './lib.mjs';
const su = await adminAs();
const g = (date) => su.call('POST', `${GAMES}/admin/v1/games/sessions`, { name: 'QA', date, start: '09:00', end: '10:00', games: ['spin'] });
const h = (date) => su.call('POST', `${HUNT}/admin/v1/hunt/sessions`, { name: 'QA', date, start: '09:00', end: '10:00', pointsPerStall: 10, winnersCount: 3, prizes: [], allowPreviousWinners: false });
for (const [id, d] of [['1', '2026-13-45'], ['2', '2026-02-30'], ['3', '2026-11-31']]) {
  expectStatus(`S7.${id}`, `games: ${d} is refused`, await g(d), 400);
  expectStatus(`H22.${id}`, `hunt: ${d} is refused`, await h(d), 400);
}
const ok = await g('2026-12-31');
expectStatus('S7.ok', 'games: a real future date is accepted', ok, 201);
await su.call('DELETE', `${GAMES}/admin/v1/games/sessions/${ok.data.sessionId}`);
const hok = await h('2026-12-31');
expectStatus('H22.ok', 'hunt: a real future date is accepted', hok, 201);
await su.call('DELETE', `${HUNT}/admin/v1/hunt/sessions/${hok.data.sessionId}`);
summary();
