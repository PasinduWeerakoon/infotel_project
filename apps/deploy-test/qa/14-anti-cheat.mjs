// QA session 14: repeat players. One play per QuickLook account, per name and per phone in a
// session; a phone already used this session makes the claim a duplicate (prize back to the pool);
// a winner with no phone is not verified and cannot collect; staff reclaim prizes; the admin finds
// the same person across sessions (account, phone or name) in the plays report and at the desk.
// The phone screens are not changed. Local only. Starts and ends with a reset.
import { execFileSync } from 'node:child_process';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GAMES, PLATFORM, adminAs, check, client, expectStatus, summary } from './lib.mjs';

const reset = () => execFileSync('node', [new URL('./reset-local.mjs', import.meta.url).pathname], { stdio: 'ignore' });
reset();

const env = readFileSync(new URL('../../backend/platform-api/.env', import.meta.url), 'utf8');
const KEY = env.match(/^PARTNER_LINK_KEY=(.*)$/m)?.[1]?.trim();
const qUser = (payload) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const body = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('hex');
};

const G = `${GAMES}/admin/v1/games`;
const su = await adminAs();
const free = () => Promise.all(['scr_spin', 'scr_dip'].map((s) => su.call('POST', `${G}/screens/${s}/release-lock`)));
await free();
const LOGO = { spin: 'logo_game_spin', 'lucky-dip': 'logo_game_dip' };

/** A QuickLook account (its own user ID) with a name */
const account = (first, last = 'QA') => ({ user_id: randomUUID(), first_name: first, last_name: last });

/** Scans and plays as that account, the way the phone does (no name or phone sent before playing) */
async function play(user, game = 'spin') {
  const v = client();
  const login = await v.call('POST', `${PLATFORM}/auth/v1/scan-login`, {
    qUser: qUser({ ...user, iat: Math.floor(Date.now() / 1000) }),
    logoId: LOGO[game],
  });
  const entry = await v.call('POST', `${GAMES}/games/v1/entries`, { scanId: login.data?.scanId });
  if (entry.status !== 201) {
    await free();
    return { v, entry };
  }
  const played = await v.call('POST', `${GAMES}/games/v1/entries/${entry.data.entryId}/play`, {});
  await free();
  const phone = (number) => v.call('POST', `${GAMES}/games/v1/entries/${entry.data.entryId}/phone`, { phone: number });
  return { v, entry, played, phone, entryId: entry.data.entryId };
}

const status = async () => (await su.call('GET', `${GAMES}/games/v1/status`)).data;
const first = (await status()).session;
check('C0', 'a games session is running', Boolean(first), JSON.stringify(first));
const given = async (sessionId) =>
  ((await su.call('GET', `${G}/sessions/${sessionId}/allocation`)).data.rows ?? []).reduce((s, r) => s + r.given, 0);
const report = async (sessionId) => (await su.call('GET', `${G}/reports/plays?sessionId=${sessionId}`)).data.items ?? [];
const rowOf = (rows, entryId) => rows.find((r) => r.entryId === entryId);
/** What the phone shows: the same fields the current result page reads */
const noPrize = (r) => Boolean(r?.data?.result) && !r.data.result.prize && !r.data.result.reference && !r.data.result.phoneNeeded;

// 1. An honest winner: plays, gives the phone, sees the reference (as today)
const kasun = account('Kasun', 'Perera');
const k = await play(kasun);
expectStatus('C1', 'Kasun plays', k.played, 200);
check('C1b', 'the win asks for the phone and hides the reference, as today', k.played.data?.result?.phoneNeeded === true && Boolean(k.played.data?.result?.prize));
const kClaim = await k.phone('0771000001');
check('C2', 'Kasun gives the phone and sees the reference', Boolean(kClaim.data?.result?.reference) && kClaim.data?.result?.phoneNeeded === false);

// 2. A second QuickLook account with the same name: the existing "already played" answer, no prize drawn
const beforeName = await given(first.sessionId);
const kasun2 = await play(account('kasun', ' PERERA '));
expectStatus('C3', 'a second account with the same name cannot play this session', kasun2.entry, 409, 'ALREADY_PLAYED_THIS_SESSION');
check('C4', 'no prize was drawn for it', (await given(first.sessionId)) === beforeName);

// 3. A new name with a phone already used this session: the phone shows no prize, prize goes back
const nimal = await play(account('Nimal', 'Silva'), 'lucky-dip');
expectStatus('C5', 'Nimal plays Lucky Dip', nimal.played, 200);
const beforeDup = await given(first.sessionId);
const dup = await nimal.phone('077 100 0001');
check('C6', 'Kasun\'s phone: no prize to collect on the phone', noPrize(dup), JSON.stringify(dup.data?.result ?? {}).slice(0, 200));
check('C7', 'the prize went back to the pool', (await given(first.sessionId)) === beforeDup - 1);
check('C8', 'typing another number does not bring the prize back', noPrize(await nimal.phone('0771000002')));
check('C9', 'refresh shows the same', noPrize(await nimal.v.call('GET', `${GAMES}/games/v1/entries/${nimal.entryId}`)));
expectStatus('C10', 'a format mistake can still be fixed (nothing saved)', await (await play(account('Format', 'Test'))).phone('123'), 422, 'PHONE_INVALID');

// 4. A winner with no phone: tagged Not verified, can still be collected, staff can reclaim
const sunil = await play(account('Sunil', 'Fernando'));
let rows = await report(first.sessionId);
check('C11', 'a winner with no phone is Not verified in the report', rowOf(rows, sunil.entryId)?.phoneMissing === true);
const sunilDesk = (await su.call('GET', `${G}/references?q=Sunil`)).data.items?.[0];
check('C12', 'the prize desk finds it by name as not verified', sunilDesk?.phoneMissing === true, JSON.stringify(sunilDesk ?? {}).slice(0, 160));
// A winner with no phone can still be collected: staff see the Not verified tag and decide
const ravi = await play(account('Ravi', 'Kumara'));
const raviDesk = (await su.call('GET', `${G}/references?q=Ravi%20Kumara`)).data.items?.[0];
const raviCollect = await su.call('POST', `${G}/references/${raviDesk?.reference}/collect`);
check('C13', 'a not verified prize can still be collected (tag only)', raviCollect.status === 200 && Boolean(raviCollect.data?.collectedAt) && raviCollect.data?.phoneMissing === true, `${raviCollect.status} ${raviCollect.code ?? ''}`);
void ravi;
const beforeReclaim = await given(first.sessionId);
expectStatus('C14', 'staff reclaim it', await su.call('POST', `${G}/entries/${sunil.entryId}/reclaim`), 200);
check('C15', 'the reclaimed prize went back to the pool', (await given(first.sessionId)) === beforeReclaim - 1);
expectStatus('C16', 'it cannot be reclaimed twice', await su.call('POST', `${G}/entries/${sunil.entryId}/reclaim`), 409, 'PRIZE_TAKEN_BACK');
check('C17', 'a phone given later shows no prize', noPrize(await sunil.phone('0771000003')));

// 5. Plays report and prize desk
rows = await report(first.sessionId);
const kRow = rowOf(rows, k.entryId);
const nRow = rowOf(rows, nimal.entryId);
check('C18', 'Kasun and Nimal (same phone) are one person: Duplicate, 2 plays', kRow?.plays === 2 && nRow?.plays === 2 && nRow?.voided === 'duplicate', JSON.stringify([kRow, nRow]));
check('C19', 'the duplicate row still names the prize it won, marked taken back', Boolean(nRow?.prize) && nRow?.voided === 'duplicate');
check('C20', 'a single play is not a duplicate', rowOf(rows, sunil.entryId)?.plays === 1 && rowOf(rows, sunil.entryId)?.voided === 'reclaimed');
const kDesk = (await su.call('GET', `${G}/references/${kClaim.data.result.reference}`)).data;
check('C21', 'the desk lists Nimal\'s play under Kasun\'s prize', kDesk?.related?.length === 1 && kDesk.related[0].entryId === nimal.entryId && kDesk.related[0].voided === 'duplicate', JSON.stringify(kDesk?.related));
check('C22', 'with the session name and times', Boolean(kDesk?.related?.[0]?.session?.startsAt && kDesk.related[0].session.name));
expectStatus('C23', 'a duplicate\'s reference cannot be collected', await su.call('POST', `${G}/references/${nimal.played.data?.result?.reference}/collect`), 409, 'PRIZE_TAKEN_BACK');
expectStatus('C24', 'Kasun\'s prize can be collected', await su.call('POST', `${G}/references/${kClaim.data.result.reference}/collect`), 200);
const csv = String((await su.call('GET', `${G}/reports/plays?sessionId=${first.sessionId}&format=csv`)).data);
check('C25', 'the CSV adds the checks and plays in the event', csv.includes('"Checks","Plays in event by this person"') && csv.includes('"Duplicate, Phone already used this session, prize taken back","2"'));

// 6. Two players typing the same new phone at the same moment: only one keeps the prize
const a = await play(account('Twin', 'One'));
const b = await play(account('Twin', 'Two'), 'lucky-dip');
const [ra, rb] = await Promise.all([a.phone('0771000009'), b.phone('0771000009')]);
const kept = [ra, rb].filter((r) => r.data?.result?.reference).length;
check('C26', 'same phone at the same moment: one keeps the prize, the other gets no prize', kept === 1 && [ra, rb].filter(noPrize).length === 1);

// 7. The next session: one play each again, and the admin sees the same person across sessions
const hhmm = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());
const cut = hhmm(Date.now() + 120_000);
expectStatus('C27', 'the running session is shortened', await su.call('PUT', `${G}/sessions/${first.sessionId}`, { name: first.name, date: today, start: hhmm(new Date(first.startsAt)), end: cut, games: first.games }), 200);
// One hour long (never past midnight), so it does not overlap the seeded sessions
const hourLater = Date.now() + 3_600_000;
const nextEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(hourLater) === today ? hhmm(hourLater) : '23:59';
const created = await su.call('POST', `${G}/sessions`, { name: 'QA next', date: today, start: cut, end: nextEnd, games: ['spin', 'lucky-dip'] });
expectStatus('C27b', 'a second session today', created, 201);
const second = created.data;
await su.call('POST', `${G}/sessions/${first.sessionId}/close`);
await su.call('POST', `${G}/sessions/${second?.sessionId}/open`);
const extra = (await su.call('POST', `${G}/prizes`, { name: `QA next ${Date.now().toString(36)}`, stock: 40, isMainPrize: false, imageKey: null })).data;
expectStatus('C27c', 'the second session gets prizes', await su.call('PUT', `${G}/sessions/${second?.sessionId}/allocation`, { rows: [{ game: 'spin', prizeId: extra.prizeId, allocated: 20 }, { game: 'lucky-dip', prizeId: extra.prizeId, allocated: 20 }] }), 200);
await new Promise((r) => setTimeout(r, 6_000)); // the APIs cache sessions for 5 seconds
check('C28', 'the second session is the running one', Boolean(second) && (await status()).session?.sessionId === second?.sessionId);

const k2 = await play(kasun);
expectStatus('C29', 'Kasun may play once in the next session', k2.played ?? k2.entry, 200);
const k2Claim = await k2.phone('0771000010');
check('C30', 'and claim with a new phone (one play per session is allowed)', Boolean(k2Claim.data?.result?.reference));
const rows2 = await report(second?.sessionId);
check('C31', 'the next session\'s row is a Duplicate with 3 plays in the event', rowOf(rows2, k2.entryId)?.plays === 3, JSON.stringify(rowOf(rows2, k2.entryId)));
const k2Desk = (await su.call('GET', `${G}/references/${k2Claim.data?.result?.reference}`)).data;
check('C32', 'the desk shows both earlier plays, one already collected', k2Desk?.related?.length === 2 && k2Desk.related.some((p) => p.collectedAt), JSON.stringify(k2Desk?.related?.map((p) => [p.name, p.collectedAt])));
const scans = (await su.call('GET', `${G}/entries/${k2.entryId}/person`)).data.items ?? [];
check('C33', 'Scans lists all 3 plays oldest first, with scan time and session times', scans.length === 3 && scans[0].entryId === k.entryId && scans.every((p) => p.scannedAt && p.session?.endsAt), JSON.stringify(scans.map((p) => p.session?.name)));
check('C34', 'Scans shows the full phone to the admin', scans.some((p) => p.phone === '0771000001'));
const fresh = await play(account('Honest', 'Visitor'));
check('C35', 'an honest new visitor plays and claims as today', Boolean((await fresh.phone('0771000012')).data?.result?.reference));
expectStatus('C36', 'reclaim cannot touch a collected prize', await su.call('POST', `${G}/entries/${k.entryId}/reclaim`), 409, 'ALREADY_COLLECTED');

// 8. More ways people try to cheat, in the second session
// Same name on the other game, with a different account
const kasunDip = await play(account('KASUN', 'perera'), 'lucky-dip');
expectStatus('C37', 'same name on the other game is refused too', kasunDip.entry, 409, 'ALREADY_PLAYED_THIS_SESSION');
// The refusal leaves the screen free: the next honest player starts at once
const next = await play(account('Next', 'Person'), 'lucky-dip');
expectStatus('C38', 'after a refusal the next player can play straight away', next.played ?? next.entry, 200);
// The same phone written another way (+94, spaces) is still the same phone
const plus = await play(account('Plus', 'Format'));
check('C39', '+94 77 100 0010 is the same as 0771000010: no prize', noPrize(await plus.phone('+94 77 100 0010')));
// A duplicate's prize is already back in the pool: reclaiming it again is refused
expectStatus('C40', 'a duplicate cannot be reclaimed again', await su.call('POST', `${G}/entries/${plus.entryId}/reclaim`), 409, 'PRIZE_TAKEN_BACK');
// A player whose turn timed out without playing has not played: they may scan again
const slow = client();
const slowUser = account('Slow', 'Player');
const slowLogin = await slow.call('POST', `${PLATFORM}/auth/v1/scan-login`, { qUser: qUser({ ...slowUser, iat: Math.floor(Date.now() / 1000) }), logoId: LOGO.spin });
expectStatus('C41', 'a player scans and does not press Play', await slow.call('POST', `${GAMES}/games/v1/entries`, { scanId: slowLogin.data?.scanId }), 201);
await free(); // staff free the screen (same as the time-out)
const slowAgain = await play(slowUser);
expectStatus('C42', 'they can scan again and play (nothing was counted)', slowAgain.played ?? slowAgain.entry, 200);
// The plays report flags only real repeats in this session
const rows3 = await report(second?.sessionId);
check('C43', 'honest players are not flagged', ['Next Person', 'Slow Player', 'Honest Visitor'].every((n) => rows3.find((r) => r.name === n)?.plays === 1), JSON.stringify(rows3.map((r) => [r.name, r.plays])));
check('C44', 'the +94 duplicate is linked to Kasun (same phone)', (rowOf(rows3, plus.entryId)?.plays ?? 0) >= 4 && rowOf(rows3, plus.entryId)?.voided === 'duplicate');
// Prize desk search by name finds every prize of the person with the other plays under each
const byName = (await su.call('GET', `${G}/references?q=Kasun`)).data.items ?? [];
check('C45', 'desk search by name finds both of Kasun\'s prizes, each with the other plays', byName.length === 2 && byName.every((r) => r.related.length >= 2), JSON.stringify(byName.map((r) => [r.reference, r.related.length])));

reset();
summary();
