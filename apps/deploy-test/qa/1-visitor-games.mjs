// QA session 1: visitor games flow
import { adminAs, check, expectStatus, GAMES, person, PLATFORM, qaPlayer, summary, wait } from './lib.mjs';

const admin = await adminAs();
expectStatus('A0', 'super admin login', admin.loginResult, 200);
const release = async (game) =>
  admin.call('POST', `${GAMES}/admin/v1/games/screens/${game === 'spin' ? 'scr_spin' : 'scr_dip'}/release-lock`);
const alloc = async (sessionId) => (await admin.call('GET', `${GAMES}/admin/v1/games/sessions/${sessionId}/allocation`)).data.rows;
const status = (await admin.call('GET', `${GAMES}/games/v1/status`)).data;
const sessionId = status.session.sessionId;
const givenTotal = async (game) => (await alloc(sessionId)).filter((r) => r.game === game).reduce((s, r) => s + r.given, 0);

// V1 entry and idempotent scan
const p1 = await person();
const scan1 = await p1.scan('logo_game_spin');
const e1 = await p1.call('POST', `${GAMES}/games/v1/entries`, { scanId: scan1 });
expectStatus('V1', 'scan Spin creates an entry', e1, 201);
const e1again = await p1.call('POST', `${GAMES}/games/v1/entries`, { scanId: scan1 });
check('V2', 'same scan again returns the same entry', e1again.status === 200 && e1again.data?.entryId === e1.data?.entryId, `got ${e1again.status} ${e1again.data?.entryId}`);
const entryId = e1.data?.entryId;
check('V3', 'entry view hides remaining quantities', !JSON.stringify(e1.data).includes('remaining'), 'remaining found in entry view');

// V4 another visitor cannot read or play it
const p2 = await person();
await p2.scan('logo_game_dip'); // signs p2 in
expectStatus('V4', "another visitor cannot read someone else's entry", await p2.call('GET', `${GAMES}/games/v1/entries/${entryId}`), 404);
expectStatus('V5', "another visitor cannot play someone else's entry", await p2.call('POST', `${GAMES}/games/v1/entries/${entryId}/play`, { player: qaPlayer() }), 404);

// V6 second visitor on the same game while the screen is busy
expectStatus('V6', 'second visitor on a busy Spin screen gets GAME_IN_PROGRESS', await p2.enter('logo_game_spin'), 409, 'GAME_IN_PROGRESS');
// V6a one player at a time across both games: Lucky Dip waits while someone plays Spin
expectStatus('V6a', 'Lucky Dip while someone plays Spin gets GAME_IN_PROGRESS', await p2.enter('logo_game_dip'), 409, 'GAME_IN_PROGRESS');

// V6b Spin needs the name and phone typed on the phone
expectStatus('V6b', 'Spin without name and phone gets PLAYER_DETAILS_REQUIRED', await p1.call('POST', `${GAMES}/games/v1/entries/${entryId}/play`), 422, 'PLAYER_DETAILS_REQUIRED');

// V7 double tap on play: one result, one prize taken
const before = await givenTotal('spin');
const [pa, pb, pc] = await Promise.all([1, 2, 3].map(() => p1.call('POST', `${GAMES}/games/v1/entries/${entryId}/play`, { player: qaPlayer() })));
const same = [pa, pb, pc].every((r) => r.status === 200 && r.data?.result?.reference === pa.data?.result?.reference);
check('V7', 'three parallel play taps return one identical result', same, [pa, pb, pc].map((r) => `${r.status}/${r.code ?? r.data?.result?.reference}`).join(' '));
const after = await givenTotal('spin');
check('V8', 'only one prize unit is taken for the triple tap', after - before === (pa.data?.result?.prize ? 1 : 0), `given went ${before} to ${after}`);
const replay = await p1.call('POST', `${GAMES}/games/v1/entries/${entryId}/play`, { player: qaPlayer() });
check('V9', 'playing again later returns the same result', replay.data?.result?.reference === pa.data?.result?.reference, `${replay.status}`);

// V10 one play per session across both games
expectStatus('V10', 'same visitor scanning Lucky Dip gets ALREADY_PLAYED', await p1.enter('logo_game_dip'), 409, 'ALREADY_PLAYED_THIS_SESSION');
await release('spin');

// V10b many people scan Spin and Lucky Dip at the same moment: exactly one gets in
const crowd = await Promise.all(Array.from({ length: 12 }, () => person()));
const scans = await Promise.all(crowd.map((c, i) => c.scan(i % 2 ? 'logo_game_dip' : 'logo_game_spin')));
const entered = await Promise.all(crowd.map((c, i) => c.call('POST', `${GAMES}/games/v1/entries`, { scanId: scans[i] })));
const winners = entered.filter((r) => r.status === 201);
check('V10b', '12 parallel scans across both games: one gets in, the rest wait', winners.length === 1 && entered.filter((r) => r.code === 'GAME_IN_PROGRESS').length === 11, entered.map((r) => r.status).join(' '));
await release(winners[0]?.data?.game ?? 'spin');
const free = await (await person()).enter('logo_game_dip');
check('V10c', 'after release the next visitor can play the other game', free.status === 201, `${free.status} ${free.code ?? ''}`);
await release('lucky-dip');

// V11 a logo that is not a game (the Treasure Hunt display logo) cannot be scanned into a game
expectStatus('V11', 'scanning a non-game logo is refused', await p2.call('POST', `${PLATFORM}/auth/v1/scan-login`, { token: `test_${crypto.randomUUID()}`, logoId: 'logo_hunt' }), 404, 'LOGO_NOT_FOUND');

// V12 a scan that belongs to another visitor
const foreign = await p1.scan('logo_game_dip');
expectStatus('V12', "another visitor's scan ID is refused", await p2.call('POST', `${GAMES}/games/v1/entries`, { scanId: foreign }), 422, 'SCAN_NOT_YOURS');

// V13 unknown scan, no sign in, bad body
const anon = await person();
expectStatus('V13', 'entry without sign in is refused', await anon.call('POST', `${GAMES}/games/v1/entries`, { scanId: 'scn_x' }), 401);
expectStatus('V14', 'entry with an unknown scan ID', await p2.call('POST', `${GAMES}/games/v1/entries`, { scanId: 'scn_does_not_exist' }), 422, 'SCAN_NOT_FOUND');
expectStatus('V15', 'entry with a malformed body', await p2.call('POST', `${GAMES}/games/v1/entries`, { nope: 1 }), 400);

// V16 paused game
expectStatus('V16a', 'pause Lucky Dip (nobody playing)', await admin.call('PUT', `${GAMES}/admin/v1/games/games/lucky-dip/status`, { paused: true }), 200);
expectStatus('V16', 'scan of a paused game gets GAME_PAUSED', await p2.enter('logo_game_dip'), 409, 'GAME_PAUSED');
const st = (await p2.call('GET', `${GAMES}/games/v1/status`)).data;
check('V17', 'status shows Lucky Dip paused', st.games?.['lucky-dip']?.paused === true && st.games?.['lucky-dip']?.open === false, JSON.stringify(st.games));
await admin.call('PUT', `${GAMES}/admin/v1/games/games/lucky-dip/status`, { paused: false });

// V18 the expired entry: shortest lock timeout, wait, then play
const settings = (await admin.call('GET', `${GAMES}/admin/v1/games/settings`)).data;
await admin.call('PUT', `${GAMES}/admin/v1/games/settings`, { lockTimeoutSeconds: 20, repeatWinnerRule: settings.repeatWinnerRule, unusedPrizes: settings.unusedPrizes });
const p3 = await person();
const e3 = await p3.enter('logo_game_dip');
expectStatus('V18a', 'new visitor enters Lucky Dip', e3, 201);
await wait(22_000);
expectStatus('V18', 'playing after the timeout gives ENTRY_EXPIRED', await p3.call('POST', `${GAMES}/games/v1/entries/${e3.data?.entryId}/play`, { player: qaPlayer() }), 409, 'ENTRY_EXPIRED');
const e3b = await p3.enter('logo_game_dip');
expectStatus('V19', 'after expiry the same visitor may scan again', e3b, 201);
expectStatus('V19b', 'Lucky Dip without name and phone gets PLAYER_DETAILS_REQUIRED', await p3.call('POST', `${GAMES}/games/v1/entries/${e3b.data?.entryId}/play`), 422, 'PLAYER_DETAILS_REQUIRED');
const v19play = await p3.call('POST', `${GAMES}/games/v1/entries/${e3b.data?.entryId}/play`, { player: qaPlayer() });
expectStatus('V20', 'and play the new entry', v19play, 200);
await release('lucky-dip');
await admin.call('PUT', `${GAMES}/admin/v1/games/settings`, { ...settings, paused: undefined });

// V21 empty prize pool for the game
const rows = (await alloc(sessionId)).filter((r) => r.game === 'spin');
const save = (list) => admin.call('PUT', `${GAMES}/admin/v1/games/sessions/${sessionId}/allocation`, { rows: list });
expectStatus('V21a', 'set Spin allocation to what was given', await save(rows.map((r) => ({ game: 'spin', prizeId: r.prizeId, allocated: r.given }))), 200);
const p4 = await person();
expectStatus('V21', 'scan when all prizes are given out gets NO_PRIZES_LEFT', await p4.enter('logo_game_spin'), 409, 'NO_PRIZES_LEFT');
expectStatus('V22', 'restore Spin allocation', await save(rows.map((r) => ({ game: 'spin', prizeId: r.prizeId, allocated: r.allocated }))), 200);

// V23 status endpoint and a play result reference format
check('V23', 'reference has the LKD-XXXX-XX format', /^LKD-[A-Z2-9]{4}-[A-Z2-9]{2}$/.test(pa.data.result.reference), pa.data?.result?.reference);
check('V24', 'wheel target points at the won segment', (() => {
  const r = pa.data?.result;
  const seg = pa.data?.display?.segments?.[r?.animation?.target];
  return seg && seg.id === r.prize?.prizeId;
})(), JSON.stringify(pa.data?.result?.animation));
// V25 every play wins (project document): a prize on both plays, and no try again segment
check('V25', 'every play wins a prize, the wheel has no try again segment', Boolean(pa.data?.result?.prize && v19play.data?.result?.prize) && !pa.data?.display?.segments?.some((x) => x.id === 'try-again'), `${pa.data?.result?.prize?.name} / ${v19play.data?.result?.prize?.name}`);

summary();
