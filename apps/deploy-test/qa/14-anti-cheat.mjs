// QA session 14: repeat players. One play per QuickLook account, per name and per phone per day
// (either game, any session); a phone already used today makes the claim a duplicate (prize back
// to the pool); a winner with no phone is tagged Not verified and can still collect; staff reclaim
// prizes; the admin finds the same person across sessions and days (account, phone or name).
// The phone screens are unchanged apart from the "already played" wording. Local only, with resets.
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

// 7. The next session the same day: one play per person per day, and the admin sees the person across sessions
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

// Same day, next session: one play per person per day, so everyone who played is refused
const beforeNext = await given(second?.sessionId);
const k2 = await play(kasun);
expectStatus('C29', 'Kasun cannot play again in the next session the same day', k2.entry, 409, 'ALREADY_PLAYED_THIS_SESSION');
check('C29b', 'the answer says "today"', k2.entry.message === 'You have already played today', k2.entry.message);
expectStatus('C30', 'Nimal (whose claim was a duplicate) also played today: refused', (await play(account('Nimal', 'Silva'), 'lucky-dip')).entry, 409, 'ALREADY_PLAYED_THIS_SESSION');
expectStatus('C31', 'a new account with Kasun\'s name on the other game: refused', (await play(account('KASUN', 'perera'), 'lucky-dip')).entry, 409, 'ALREADY_PLAYED_THIS_SESSION');
check('C32', 'no prize was drawn for any of them', (await given(second?.sessionId)) === beforeNext);
const stranger = await play(account('Stranger', 'Person'));
check('C33', 'a new person typing Kasun\'s phone (used today): no prize', noPrize(await stranger.phone('0771000001')));
const plus = await play(account('Plus', 'Format'));
check('C34', 'the same phone written as +94 77 100 0001: no prize', noPrize(await plus.phone('+94 77 100 0001')));
expectStatus('C35', 'a duplicate cannot be reclaimed again', await su.call('POST', `${G}/entries/${plus.entryId}/reclaim`), 409, 'PRIZE_TAKEN_BACK');
expectStatus('C36', 'reclaim cannot touch a collected prize', await su.call('POST', `${G}/entries/${k.entryId}/reclaim`), 409, 'ALREADY_COLLECTED');
// The refusals leave the screen free: the next honest players play and claim as today
const fresh = await play(account('Honest', 'Visitor'));
check('C37', 'an honest new visitor plays and claims as today', Boolean((await fresh.phone('0771000012')).data?.result?.reference));
// A player whose turn timed out without playing has not played today: they may scan again
const slow = client();
const slowUser = account('Slow', 'Player');
const slowLogin = await slow.call('POST', `${PLATFORM}/auth/v1/scan-login`, { qUser: qUser({ ...slowUser, iat: Math.floor(Date.now() / 1000) }), logoId: LOGO.spin });
expectStatus('C38', 'a player scans and does not press Play', await slow.call('POST', `${GAMES}/games/v1/entries`, { scanId: slowLogin.data?.scanId }), 201);
await free(); // staff free the screen (same as the time-out)
const slowAgain = await play(slowUser);
expectStatus('C39', 'they can scan again and play (nothing was counted)', slowAgain.played ?? slowAgain.entry, 200);
// Admin across sessions
const rows3 = await report(second?.sessionId);
check('C40', 'honest players are not flagged', ['Honest Visitor', 'Slow Player'].every((n) => rows3.find((r) => r.name === n)?.plays === 1), JSON.stringify(rows3.map((r) => [r.name, r.plays])));
check('C41', 'the stranger with Kasun\'s phone is linked to Kasun (Duplicate)', (rowOf(rows3, stranger.entryId)?.plays ?? 0) >= 3 && rowOf(rows3, stranger.entryId)?.voided === 'duplicate', JSON.stringify(rowOf(rows3, stranger.entryId)));
const scans = (await su.call('GET', `${G}/entries/${stranger.entryId}/person`)).data.items ?? [];
check('C42', 'Scans lists the person\'s plays oldest first, with scan and session times', scans.length >= 3 && scans[0].entryId === k.entryId && scans.every((p) => p.scannedAt && p.session?.endsAt), JSON.stringify(scans.map((p) => p.session?.name)));
check('C43', 'Scans shows the full phone to the admin', scans.some((p) => p.phone === '0771000001'));
const byName = (await su.call('GET', `${G}/references?q=Kasun`)).data.items ?? [];
check('C44', 'desk search by name finds Kasun\'s prize with the other plays under it', byName.length === 1 && byName[0].related.length >= 3, JSON.stringify(byName.map((r) => [r.reference, r.related.length])));

// The next day: yesterday's plays do not block. Kasun's day records move to an earlier date
// (as if he played yesterday), then he plays again.
const { DynamoDBClient, QueryCommand, PutItemCommand, DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
const ddb = new DynamoDBClient({ endpoint: 'http://localhost:8100', region: 'local', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const dayItems = (await ddb.send(new QueryCommand({ TableName: 'lkdr-games-event', KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': { S: `DAY#${today}` } } }))).Items ?? [];
check('C45', 'today\'s day records exist (account, name and phone)', ['ACCOUNT#', 'NAME#', 'PHONE#'].every((p) => dayItems.some((i) => i.SK.S.startsWith(p))), dayItems.map((i) => i.SK.S).join(','));
for (const item of dayItems) {
  await ddb.send(new PutItemCommand({ TableName: 'lkdr-games-event', Item: { ...item, PK: { S: 'DAY#2000-01-01' } } }));
  await ddb.send(new DeleteItemCommand({ TableName: 'lkdr-games-event', Key: { PK: item.PK, SK: item.SK } }));
}
const nextDay = await play(kasun);
expectStatus('C46', 'the next day Kasun can play once again', nextDay.played ?? nextDay.entry, 200);
check('C47', 'and claim with his own phone', Boolean((await nextDay.phone('0771000001')).data?.result?.reference));
expectStatus('C48', 'but not twice that day', (await play(kasun, 'lucky-dip')).entry, 409, 'ALREADY_PLAYED_THIS_SESSION');

reset();
summary();
