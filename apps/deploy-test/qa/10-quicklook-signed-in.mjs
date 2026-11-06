// QA session 10: visitors signed in to the QuickLook app (encrypted ?qUser= link), next to guests
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { GAMES, PLATFORM, adminAs, check, client, expectStatus, summary } from './lib.mjs';

const env = readFileSync(new URL('../../backend/platform-api/.env', import.meta.url), 'utf8');
const KEY = env.match(/^PARTNER_LINK_KEY=(.*)$/m)?.[1]?.trim();
/** A link the way QuickLook makes it: hex(iv 12 | AES-256-GCM ciphertext | tag 16) */
const qUser = (payload) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const body = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('hex');
};
const admin = await adminAs();
const release = () => admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_spin/release-lock`);
// Both games share one player lock: free it from earlier sessions before starting
await release();
await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
const user = { user_id: randomUUID(), first_name: 'Kasun', last_name: 'Silva', iat: Math.floor(Date.now() / 1000) };
check('S0', 'the local server has a QuickLook link key', Boolean(KEY));

// S1 signed in: the QuickLook name is used and locked
const v = client();
const login = await v.call('POST', `${PLATFORM}/auth/v1/scan-login`, { qUser: qUser(user), logoId: 'logo_game_spin' });
expectStatus('S1', 'signed-in QuickLook link signs the visitor in', login, 200);
const session = (await v.call('GET', `${PLATFORM}/auth/v1/session`)).data;
check('S2', 'name from QuickLook, locked, and no locked phone', session?.firstName === 'Kasun Silva' && session?.nameLocked === true && !session?.phone, JSON.stringify(session));

// S3 a signed-in visitor plays with no popup: the QuickLook name is used, the phone comes after a win
const entry = await v.call('POST', `${GAMES}/games/v1/entries`, { scanId: login.data?.scanId });
expectStatus('S3', 'signed-in visitor creates an entry', entry, 201);
const play = await v.call('POST', `${GAMES}/games/v1/entries/${entry.data?.entryId}/play`, {});
expectStatus('S4', 'signed-in visitor plays without sending name or phone', play, 200);
const won = Boolean(play.data?.result?.prize);
check('S4b', 'a win asks for the phone, no win does not', play.data?.result?.phoneNeeded === won, JSON.stringify(play.data?.result ?? {}).slice(0, 160));
const sessionId = (await admin.call('GET', `${GAMES}/games/v1/status`)).data?.session?.sessionId;
const report = async () => {
  const rows = (await admin.call('GET', `${GAMES}/admin/v1/games/reports/plays?sessionId=${sessionId}`)).data?.items ?? [];
  return rows.find((r) => r.entryId === entry.data?.entryId) ?? rows.find((r) => r.name === 'Kasun Silva');
};
const before = await report();
check('S5', 'the play keeps the QuickLook name, no phone yet', before?.name === 'Kasun Silva' && !before?.phone, JSON.stringify(before ?? {}).slice(0, 200));
await release();
if (won) {
  const phoneUrl = `${GAMES}/games/v1/entries/${entry.data?.entryId}/phone`;
  expectStatus('S5a', 'a phone with letters is refused', await v.call('POST', phoneUrl, { phone: '12345abc' }), 422, 'PHONE_INVALID');
  expectStatus('S5b', 'another visitor cannot add a phone to this win', await client().call('POST', phoneUrl, { phone: '0771112223' }), 401);
  const saved = await v.call('POST', phoneUrl, { phone: '077 999 8887' });
  expectStatus('S5c', 'the winner adds the phone', saved, 200);
  check('S5d', 'the phone is no longer asked and the reference shows', saved.data?.result?.phoneNeeded === false && Boolean(saved.data?.result?.reference));
  await v.call('POST', phoneUrl, { phone: '0700000000' });
  const desk = (await admin.call('GET', `${GAMES}/admin/v1/games/references/${saved.data?.result?.reference}`)).data;
  check('S5e', 'prize desk sees the name and the first phone given (it cannot be changed)', desk?.player?.name === 'Kasun Silva' && desk?.player?.phone === '0779998887', JSON.stringify(desk?.player));
  const after = await report();
  check('S5f', 'plays report shows the phone, masked', String(after?.phone).endsWith('887') && String(after?.phone).includes('*'), after?.phone);
} else {
  check('S5a-f', 'no prize this time: phone steps skipped (rerun to cover them)', true);
}

// S6 the same QuickLook user again, from a new link on another phone: one play per session
const v2 = client();
const again = await v2.call('POST', `${PLATFORM}/auth/v1/scan-login`, { qUser: qUser({ ...user, iat: Math.floor(Date.now() / 1000) }), logoId: 'logo_game_dip' });
expectStatus('S6', 'same QuickLook user on another phone signs in', again, 200);
expectStatus('S7', 'same QuickLook user cannot play again this session', await v2.call('POST', `${GAMES}/games/v1/entries`, { scanId: again.data?.scanId }), 409, 'ALREADY_PLAYED_THIS_SESSION');

// S8 a changed link is refused
const good = qUser(user);
const bad = `${good.slice(0, 40)}${good[40] === 'a' ? 'b' : 'a'}${good.slice(41)}`;
expectStatus('S8', 'a changed QuickLook link is refused', await client().call('POST', `${PLATFORM}/auth/v1/scan-login`, { qUser: bad, logoId: 'logo_game_spin' }), 401, 'LINK_INVALID');

// S9 the phone flow with a signed-in link: straight to the game, no popup before playing
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
/** On the result page: a win asks only for the phone, then shows the reference */
const claim = async (id, label, phone) => {
  await page.waitForTimeout(1500);
  if (!(await page.getByText('YOU WON!').count())) return check(id, `${label}: no prize, no phone asked`, (await page.getByText('One last step').count()) === 0);
  const asked = await page.getByText('One last step').isVisible();
  const noName = (await page.getByLabel('Your name').count()) === 0;
  const hidden = (await page.getByText('•••• ••••').count()) === 1;
  await page.reload();
  await page.getByText('One last step').waitFor({ timeout: 10000 });
  await page.getByLabel('Phone number').fill('12345abc');
  await page.getByRole('button', { name: /continue/i }).click();
  const refused = await page.getByText('Please check your phone number').waitFor({ timeout: 5000 }).then(() => true, () => false);
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('link', { name: /awesome/i }).waitFor({ timeout: 10000 });
  const shown = (await page.getByText('•••• ••••').count()) === 0 && (await page.getByText('One last step').count()) === 0;
  check(id, `${label}: win asks only the phone, again after reload, checks it, then shows the reference`, asked && noName && hidden && refused && shown, `asked ${asked}, no name ${noName}, hidden ${hidden}, refused ${refused}, shown ${shown}`);
};
const fresh = { user_id: randomUUID(), first_name: 'Dilini', last_name: 'Fernando', iat: Math.floor(Date.now() / 1000) };
try {
  await page.goto(`http://localhost:5173/q/logo_game_dip?qUser=${qUser(fresh)}`);
  await page.waitForURL(/\/play\//, { timeout: 20000 });
  await page.waitForTimeout(1200);
  check('S9', 'signed-in link goes straight to the game with no popup', (await page.getByText('Before you play').count()) === 0);
  await page.getByRole('button', { name: 'Box 1' }).click();
  await page.waitForURL(/\/result\//, { timeout: 30000 });
  check('S10', 'signed-in visitor plays Lucky Dip and gets a result', true);
  await claim('S11', 'Lucky Dip', '0765554443');
} catch (e) {
  check('S9-11', 'signed-in Lucky Dip flow', false, e.message.split('\n')[0]);
}
// S13 a QuickLook user with a one letter name, on Spin the Wheel
try {
  await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
  const tiny = { user_id: randomUUID(), first_name: 'A', last_name: '', iat: Math.floor(Date.now() / 1000) };
  await page.goto(`http://localhost:5173/q/logo_game_spin?qUser=${qUser(tiny)}`);
  await page.waitForURL(/\/play\//, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const noPopup = (await page.getByText('Before you play').count()) === 0;
  await page.getByRole('button', { name: /spin/i }).click();
  await page.waitForURL(/\/result\//, { timeout: 30000 });
  check('S13', 'Spin signed in (one letter name): no popup, spin gives a result', noPopup);
  await claim('S14', 'Spin the Wheel', '0712223334');
  await release();
} catch (e) {
  check('S13-14', 'signed-in Spin flow', false, e.message.split('\n')[0]);
}
check('S12', 'no page crashes', errors.length === 0, errors.join(' | '));
await browser.close();
await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
summary();
