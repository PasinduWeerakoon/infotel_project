// QA session 11: never more prizes than the admin allocated (both games, repeated taps, crowds)
import { GAMES, adminAs, check, expectStatus, person, summary } from './lib.mjs';

const G = `${GAMES}/admin/v1/games`;
const su = await adminAs();
const release = async () => {
  await su.call('POST', `${G}/screens/scr_spin/release-lock`);
  await su.call('POST', `${G}/screens/scr_dip/release-lock`);
};
await release();
const session = (await su.call('GET', `${GAMES}/games/v1/status`)).data.session;
const mk = async (name, stock, isMainPrize) => (await su.call('POST', `${G}/prizes`, { name, stock, isMainPrize, imageKey: null })).data;
const tag = Date.now().toString(36);
const a = await mk(`QA stock A ${tag}`, 5, false);
const b = await mk(`QA stock B ${tag}`, 3, false);
const m = await mk(`QA stock main ${tag}`, 2, true);

// The admin cannot allocate more than the catalogue stock
const current = (await su.call('GET', `${G}/sessions/${session.sessionId}/allocation`)).data.rows;
// Only prizes still in the catalogue (earlier sessions delete their own test prizes)
const known = new Set((await su.call('GET', `${G}/prizes`)).data.items.map((p) => p.prizeId));
// Other prizes are capped at what they already gave (the server never allows less), so nothing else is left to win
const zeroed = current.filter((r) => known.has(r.prizeId)).map((r) => ({ game: r.game, prizeId: r.prizeId, allocated: r.given }));
const over = await su.call('PUT', `${G}/sessions/${session.sessionId}/allocation`, { rows: [...zeroed, { game: 'spin', prizeId: a.prizeId, allocated: 4 }, { game: 'lucky-dip', prizeId: a.prizeId, allocated: 2 }] });
check('K1', 'allocating 6 of a prize with stock 5 is refused', over.status >= 400, `${over.status} ${over.code ?? ''}`);

// Spin: A 3, B 2, main 1. Lucky Dip: A 2, B 1, main 1. Nothing else in this session.
const plan = { spin: { [a.prizeId]: 3, [b.prizeId]: 2, [m.prizeId]: 1 }, 'lucky-dip': { [a.prizeId]: 2, [b.prizeId]: 1, [m.prizeId]: 1 } };
const rows = Object.entries(plan).flatMap(([game, p]) => Object.entries(p).map(([prizeId, allocated]) => ({ game, prizeId, allocated })));
expectStatus('K2', 'allocate 6 to Spin and 4 to Lucky Dip', await su.call('PUT', `${G}/sessions/${session.sessionId}/allocation`, { rows: [...zeroed, ...rows] }), 200);

// Play until both games say no prizes left. Each player taps Play three times at once.
const won = { spin: {}, 'lucky-dip': {} };
const ended = { spin: false, 'lucky-dip': false };
let refusedAfterEmpty = 0;
let duplicateResults = 0;
for (let i = 0; i < 40 && !(ended.spin && ended['lucky-dip']); i++) {
  const game = i % 2 ? 'lucky-dip' : 'spin';
  const logo = game === 'spin' ? 'logo_game_spin' : 'logo_game_dip';
  const p = await person();
  const entry = await p.enter(logo);
  if (entry.code === 'NO_PRIZES_LEFT') { ended[game] = true; refusedAfterEmpty++; continue; }
  if (entry.status !== 201) { console.log('      entry', entry.status, entry.code); await release(); continue; }
  const taps = await Promise.all([1, 2, 3].map(() => p.call('POST', `${GAMES}/games/v1/entries/${entry.data.entryId}/play`, { player: { name: 'QA Stock', phone: '0771234567' } })));
  const ok = taps.filter((t) => t.status === 200);
  if (new Set(ok.map((t) => t.data?.result?.reference)).size > 1) duplicateResults++;
  const prize = ok[0]?.data?.result?.prize;
  if (prize) won[game][prize.prizeId ?? prize.name] = (won[game][prize.prizeId ?? prize.name] ?? 0) + 1;
  if (!ok.length && taps.some((t) => t.code === 'NO_PRIZES_LEFT')) { ended[game] = true; refusedAfterEmpty++; }
  await release();
}
console.log('      won', JSON.stringify(won));
check('K3', 'three taps at once never give two prizes for one play', duplicateResults === 0, `${duplicateResults}`);

const ours = new Set([a.prizeId, b.prizeId, m.prizeId]);
const alloc = (await su.call('GET', `${G}/sessions/${session.sessionId}/allocation`)).data.rows.filter((r) => ours.has(r.prizeId) && r.allocated > 0);
check('K4', 'every allocation is given exactly, never more', alloc.length === 6 && alloc.every((r) => r.given === r.allocated && r.remaining === 0), JSON.stringify(alloc.map((r) => `${r.game}:${r.allocated}/${r.given}/${r.remaining}`)));
const total = (g) => Object.entries(won[g]).filter(([id]) => ours.has(id)).reduce((s, [, n]) => s + n, 0);
const others = Object.values(won).flatMap((g) => Object.keys(g)).filter((id) => !ours.has(id));
check('K5', 'Spin players won exactly 6 prizes, Lucky Dip exactly 4, nothing else', total('spin') === 6 && total('lucky-dip') === 4 && others.length === 0, `${total('spin')} and ${total('lucky-dip')}, others ${others.join(',')}`);
check('K6', 'after the last prize the next players are told no prizes are left', ended.spin && ended['lucky-dip'] && refusedAfterEmpty >= 2, JSON.stringify(ended));

// A crowd after the stock is gone gets nothing either
const crowd = await Promise.all(Array.from({ length: 8 }, () => person()));
const tries = await Promise.all(crowd.map((c, i) => c.enter(i % 2 ? 'logo_game_dip' : 'logo_game_spin')));
check('K7', '8 more people at once after the stock is gone: no new entries', tries.every((t) => t.status !== 201), tries.map((t) => t.code ?? t.status).join(' '));
const after = (await su.call('GET', `${G}/sessions/${session.sessionId}/allocation`)).data.rows;
check('K8', 'still nothing given beyond the allocation', after.every((r) => r.given <= r.allocated), JSON.stringify(after.map((r) => `${r.allocated}/${r.given}`)));
const catalogue = (await su.call('GET', `${G}/prizes`)).data.items.filter((p) => [a.prizeId, b.prizeId, m.prizeId].includes(p.prizeId));
check('K9', 'catalogue: each prize given at most its stock', catalogue.every((p) => (p.given ?? 0) <= p.stock), JSON.stringify(catalogue.map((p) => `${p.name.split(' ').slice(0, 3).join(' ')} ${p.stock}/${p.given ?? '?'}`)));
await release();
summary();
