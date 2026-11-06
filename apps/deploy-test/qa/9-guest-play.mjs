// QA session 9: playing without the QuickLook app (guest: name and phone, the phone is the identity)
import { chromium } from 'playwright-core';
import { GAMES, PLATFORM, adminAs, check, client, expectStatus, summary } from './lib.mjs';

const admin = await adminAs();
const release = () => admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_spin/release-lock`);
// Both games share one player lock: free it from earlier sessions before starting
await release();
await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
const guestLogin = (c, body) => c.call('POST', `${PLATFORM}/auth/v1/guest-login`, body);
const number = `07${String(Date.now()).slice(-8)}`; // a new phone number every run
const spaced = `+94 ${number.slice(1, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;

// G1 a guest signs in with name and phone, and gets a scan for the game
const g1 = client();
const login = await guestLogin(g1, { logoId: 'logo_game_spin', name: 'Guest Player', phone: number });
expectStatus('G1', 'guest signs in with name and phone', login, 200);
const session = await g1.call('GET', `${PLATFORM}/auth/v1/session`);
check('G2', 'guest session keeps the name and phone locked', session.data?.nameLocked === true && session.data?.phone === number, JSON.stringify(session.data));

// G3 the guest plays; the server uses the phone they signed in with, whatever the popup sends
const entry = await g1.call('POST', `${GAMES}/games/v1/entries`, { scanId: login.data?.scanId });
expectStatus('G3', 'guest creates an entry', entry, 201);
const played = await g1.call('POST', `${GAMES}/games/v1/entries/${entry.data?.entryId}/play`, { player: { name: 'Someone Else', phone: '0700000000' } });
expectStatus('G4', 'guest plays', played, 200);
const sessionId = (await admin.call('GET', `${GAMES}/games/v1/status`)).data?.session?.sessionId;
const report = await admin.call('GET', `${GAMES}/admin/v1/games/reports/plays?sessionId=${sessionId}`);
const row = (report.data?.items ?? report.data?.rows ?? []).find((r) => r.reference && r.reference === played.data?.result?.reference) ?? (report.data?.items ?? []).find((r) => r.name === 'Guest Player');
check('G5', 'the play keeps the guest name and phone, not what the popup sent', row?.name === 'Guest Player' && String(row?.phone).endsWith(number.slice(-3)), JSON.stringify(row ?? report.data).slice(0, 200));
await release();

// G6 the same number typed another way, on another phone, is the same player: one play per session
const g2 = client();
const again = await guestLogin(g2, { logoId: 'logo_game_dip', name: 'Guest Player', phone: spaced });
expectStatus('G6', 'same number typed with +94 and spaces signs in', again, 200);
expectStatus('G7', 'same number cannot play again this session', await g2.call('POST', `${GAMES}/games/v1/entries`, { scanId: again.data?.scanId }), 409, 'ALREADY_PLAYED_THIS_SESSION');

// G8 bad input
expectStatus('G8', 'a phone number that is not a number is refused', await guestLogin(client(), { logoId: 'logo_game_spin', name: 'Guest Player', phone: '12345abc' }), 422, 'PHONE_INVALID');
expectStatus('G9', 'a missing name is refused', await guestLogin(client(), { logoId: 'logo_game_spin', name: '', phone: number }), 400);
expectStatus('G10', 'guest sign in for a Treasure Hunt stall is refused', await guestLogin(client(), { logoId: 'logo_stall_01', name: 'Guest Player', phone: number }), 404, 'LOGO_NOT_FOUND');

// G11 the phone flow: no QuickLook sign in, the guest form, then the game with details filled in
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Locally the server runs in test mode and would sign the phone in; answer like the event server does
await page.route('**/auth/v1/scan-login', (route) =>
  route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'QUICKLOOK_SIGN_IN_REQUIRED', message: 'Please sign in' } }) }),
);
const uiNumber = `07${String(Date.now() + 7).slice(-8)}`;
try {
  await page.goto('http://localhost:5173/q/logo_game_spin');
  // One screen only: the "Before you play" popup asks for the name and phone, then the game opens
  await page.getByLabel('Your name').fill('Phone Guest', { timeout: 15000 });
  await page.getByLabel('Phone number').fill('12');
  check('G11', 'Continue stays disabled until name and phone are given', await page.getByRole('button', { name: /continue/i }).isDisabled());
  await page.getByLabel('Phone number').fill('99999999');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByText(/check your phone number/i).waitFor({ timeout: 10000 });
  check('G12', 'a wrong phone number shows a message in the popup', true);
  await page.getByLabel('Phone number').fill(uiNumber);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL(/\/play\//, { timeout: 20000 });
  await page.waitForTimeout(1500);
  check('G13', 'the game opens without asking for the details a second time', (await page.getByText('Before you play').count()) === 0 && !(await page.getByRole('button', { name: /spin/i }).isDisabled()));
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/guest-game.png` });
  await page.getByRole('button', { name: /spin/i }).click();
  await page.waitForURL(/\/result\//, { timeout: 30000 });
  check('G14', 'the guest spins and gets a result', true);
} catch (e) {
  check('G11-14', 'guest phone flow', false, `${e.message.split('\n')[0]} at ${page.url()} :: ${(await page.locator('body').innerText()).slice(0, 160).replace(/\s+/g, ' ')}`);
}
// G16 the same for Lucky Dip: popup first, then the boxes open without asking again
try {
  await release();
  await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
  const dipNumber = `07${String(Date.now() + 13).slice(-8)}`;
  await page.goto('http://localhost:5173/q/logo_game_dip');
  await page.getByLabel('Your name').fill('Dip Guest', { timeout: 15000 });
  await page.getByLabel('Phone number').fill(dipNumber);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL(/\/play\//, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const asked = await page.getByText('Before you play').count();
  const open = !(await page.getByRole('button', { name: 'Box 1' }).isDisabled());
  check('G16', 'Lucky Dip guest: popup once, then the boxes are open', asked === 0 && open, `popup ${asked}, boxes open ${open}`);
  await page.getByRole('button', { name: 'Box 1' }).click();
  await page.getByRole('button', { name: 'Box 2' }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForURL(/\/result\//, { timeout: 30000 });
  check('G17', 'Lucky Dip guest picks a box and gets a result', true);
} catch (e) {
  check('G16-17', 'Lucky Dip guest flow', false, `${e.message.split('\n')[0]} at ${page.url()}`);
}
await admin.call('POST', `${GAMES}/admin/v1/games/screens/scr_dip/release-lock`);
check('G15', 'no page crashes', errors.length === 0, errors.join(' | '));
await browser.close();
await release();
summary();
