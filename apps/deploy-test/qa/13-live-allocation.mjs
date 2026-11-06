// QA session 13: changing a running session's prize allocation while people play. Raise, lower,
// refuse what breaks the rules, add a prize, save while plays land, and how main prizes behave
// when their number is raised halfway. Local only. Starts and ends with a reset.
import { execFileSync } from 'node:child_process';
import { adminAs, check, expectStatus, GAMES, person, qaPlayer, summary } from './lib.mjs';

const reset = () => execFileSync('node', [new URL('./reset-local.mjs', import.meta.url).pathname], { stdio: 'ignore' });
reset();
const G = `${GAMES}/admin/v1/games`;
const su = await adminAs();
const session = (await su.call('GET', `${GAMES}/games/v1/status`)).data.session;
check('L0', 'a games session is running', Boolean(session), JSON.stringify(session));
const S = `${G}/sessions/${session.sessionId}`;
const LOGO = { spin: 'logo_game_spin', 'lucky-dip': 'logo_game_dip' };
const SCREEN = { spin: 'scr_spin', 'lucky-dip': 'scr_dip' };
const release = (game) => su.call('POST', `${G}/screens/${SCREEN[game]}/release-lock`);
const mk = async (name, stock, isMainPrize = false) => (await su.call('POST', `${G}/prizes`, { name, stock, isMainPrize, imageKey: null })).data;
const save = (rows) => su.call('PUT', `${S}/allocation`, { rows });
const cell = async (prizeId, game = 'spin') => (await su.call('GET', `${S}/allocation`)).data.rows.find((r) => r.prizeId === prizeId && r.game === game);

/** One player plays one game: the prize won, or the error code */
async function play(game = 'spin') {
  const p = await person();
  const e = await p.enter(LOGO[game]);
  if (e.status !== 201) { await release(game); return { code: e.code ?? String(e.status) }; }
  const r = await p.call('POST', `${GAMES}/games/v1/entries/${e.data.entryId}/play`, { player: qaPlayer('QA Live') });
  await release(game);
  return r.status === 200 ? { prizeId: r.data.result.prize?.prizeId } : { code: r.code ?? String(r.status) };
}

// Only our test prizes in this session, so every win is one of them
const tag = Date.now().toString(36);
const A = await mk(`QA live A ${tag}`, 10);
const current = (await su.call('GET', `${S}/allocation`)).data.rows;
const known = new Set((await su.call('GET', `${G}/prizes`)).data.items.map((p) => p.prizeId));
const zeroed = current.filter((r) => known.has(r.prizeId) && r.prizeId !== A.prizeId).map((r) => ({ game: r.game, prizeId: r.prizeId, allocated: r.given }));
expectStatus('L1', 'only QA prize A (5) for Spin in the running session', await save([...zeroed, { game: 'spin', prizeId: A.prizeId, allocated: 5 }]), 200);

const won = [];
for (let i = 0; i < 3; i++) won.push(await play());
check('L2', 'three players win prize A', won.every((w) => w.prizeId === A.prizeId), JSON.stringify(won));
let a = await cell(A.prizeId);
check('L3', 'allocation shows 3 given, 2 left', a.given === 3 && a.remaining === 2, JSON.stringify(a));

// Raise while running
expectStatus('L4', 'raise prize A from 5 to 8 while the session runs', await save([{ game: 'spin', prizeId: A.prizeId, allocated: 8 }]), 200);
a = await cell(A.prizeId);
check('L5', 'the given count is kept, 5 left now', a.allocated === 8 && a.given === 3 && a.remaining === 5, JSON.stringify(a));
const more = await play();
check('L6', 'the next player still wins', more.prizeId === A.prizeId, JSON.stringify(more));

// Lower to exactly what was given: nothing left, the next player is told so
expectStatus('L7', 'lower prize A to what was already given (4)', await save([{ game: 'spin', prizeId: A.prizeId, allocated: 4 }]), 200);
const none = await play();
check('L8', 'then the next player is told no prizes are left (before playing)', none.code === 'NO_PRIZES_LEFT', JSON.stringify(none));

// Refused changes leave the allocation as it was
const below = await save([{ game: 'spin', prizeId: A.prizeId, allocated: 2 }]);
expectStatus('L9', 'lowering below what was already given is refused', below, 409, 'ALLOCATION_INVALID');
const over = await save([{ game: 'spin', prizeId: A.prizeId, allocated: 11 }]);
expectStatus('L10', 'more than the prize stock (10) is refused', over, 409, 'ALLOCATION_INVALID');
const overBoth = await save([{ game: 'spin', prizeId: A.prizeId, allocated: 8 }, { game: 'lucky-dip', prizeId: A.prizeId, allocated: 3 }]);
expectStatus('L11', 'more than the stock across both games (8 + 3 of 10) is refused', overBoth, 409, 'ALLOCATION_INVALID');
a = await cell(A.prizeId);
check('L12', 'after refused saves nothing changed (4 given of 4)', a.allocated === 4 && a.given === 4 && a.remaining === 0, JSON.stringify(a));
const neg = await save([{ game: 'spin', prizeId: A.prizeId, allocated: -1 }]);
expectStatus('L13', 'a negative number is refused', neg, 400);

// Add a new prize to the running session
const B = await mk(`QA live B ${tag}`, 50);
expectStatus('L14', 'add prize B (6) to the running session', await save([{ game: 'spin', prizeId: B.prizeId, allocated: 6 }]), 200);
const bWin = await play();
check('L15', 'the next player wins the new prize B', bWin.prizeId === B.prizeId, JSON.stringify(bWin));

// A player who scanned before the change plays after it
const early = await person();
const entry = await early.enter(LOGO.spin);
expectStatus('L16', 'raise B to 10 while a player is on the wheel (entered, not played)', await save([{ game: 'spin', prizeId: B.prizeId, allocated: 10 }]), 200);
const late = await early.call('POST', `${GAMES}/games/v1/entries/${entry.data.entryId}/play`, { player: qaPlayer('QA Live') });
await release('spin');
check('L17', 'that player still plays and wins', late.status === 200 && late.data.result.prize?.prizeId === B.prizeId, `${late.status} ${late.code ?? ''}`);
let b = await cell(B.prizeId);
check('L18', 'B counts are right (2 given, 8 left)', b.given === 2 && b.remaining === 8, JSON.stringify(b));

// Saves while plays land (one player at a time across both games, decision D-12, so they alternate)
const C = await mk(`QA live C ${tag}`, 100);
expectStatus('L19', 'give Lucky Dip prize C (10)', await save([{ game: 'lucky-dip', prizeId: C.prizeId, allocated: 10 }]), 200);
const saves = [];
const playing = (async () => {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(await play(i % 2 ? 'lucky-dip' : 'spin'));
  return out;
})();
for (let i = 0; i < 10; i++) {
  saves.push(save([{ game: 'spin', prizeId: B.prizeId, allocated: 12 + i }, { game: 'lucky-dip', prizeId: C.prizeId, allocated: 12 + i }]));
  await new Promise((r) => setTimeout(r, 250));
}
const saved = await Promise.all(saves);
const results = await playing;
const statuses = saved.map((s) => s.status);
check('L20', 'saves during plays: each one saves or asks to try again, never a server error', statuses.every((s) => s === 200 || s === 409), statuses.join(','));
check('L21', 'at least some saves landed during the plays', statuses.filter((s) => s === 200).length >= 5, statuses.join(','));
check('L22', 'every player during the saves won a prize', results.every((r) => r.prizeId), JSON.stringify(results.filter((r) => !r.prizeId)));
b = await cell(B.prizeId);
const c = await cell(C.prizeId, 'lucky-dip');
const wonB = 2 + results.filter((r) => r.prizeId === B.prizeId).length;
const wonC = results.filter((r) => r.prizeId === C.prizeId).length;
check('L23', 'given matches the prizes actually won, nothing lost or counted twice', b.given === wonB && c.given === wonC, `B ${b.given}/${wonB} C ${c.given}/${wonC}`);
check('L24', 'left = allocated minus given on both', b.remaining === b.allocated - b.given && c.remaining === c.allocated - c.given, JSON.stringify([b, c]));
const catalogue = (await su.call('GET', `${G}/prizes`)).data.items.filter((p) => [A.prizeId, B.prizeId, C.prizeId].includes(p.prizeId));
check('L25', 'the catalogue never gives more than its stock', catalogue.every((p) => (p.given ?? 0) <= p.stock), JSON.stringify(catalogue.map((p) => `${p.stock}/${p.given}`)));

// Main prizes: raised from 1 to 12 more than halfway through the session
const M = await mk(`QA live main ${tag}`, 20, true);
expectStatus('L26', 'give Spin 1 main prize', await save([{ game: 'spin', prizeId: M.prizeId, allocated: 1 }]), 200);
expectStatus('L27', 'raise the main prize from 1 to 12 while running', await save([{ game: 'spin', prizeId: M.prizeId, allocated: 12 }]), 200);
const burst = [];
for (let i = 0; i < 12; i++) burst.push(await play());
const mains = burst.filter((r) => r.prizeId === M.prizeId).length;
const elapsed = (Date.now() - Date.parse(session.startsAt)) / (Date.parse(session.endsAt) - Date.parse(session.startsAt));
console.log(`      session ${Math.round(elapsed * 100)}% through: ${mains} of the next 12 players won a main prize`);
const m = await cell(M.prizeId);
check('L28', 'main prize counts stay right after raising it', m.given === mains && m.remaining === 12 - mains, JSON.stringify(m));
check('L29', 'never more main prizes than allocated', m.given <= m.allocated, JSON.stringify(m));

reset();
summary();
