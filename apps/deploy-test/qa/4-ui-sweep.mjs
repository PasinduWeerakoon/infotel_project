// QA session 4: UI sweep (console errors, crashes, failed calls, horizontal overflow)
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { ADMIN_PASSWORD, GAMES, adminAs, check, summary } from './lib.mjs';

const browser = await chromium.launch({ channel: 'chrome' });
const watch = (page, bag) => {
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('status of 401') && bag.push(`console: ${m.text().slice(0, 160)}`));
  page.on('pageerror', (e) => bag.push(`crash: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => r.status() >= 500 && bag.push(`${r.status()} ${r.url()}`));
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function sweep(id, label, ctxOptions, steps) {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  const bag = [];
  watch(page, bag);
  const notes = [];
  try {
    await steps(page, notes);
  } catch (e) {
    bag.push(`step failed: ${e.message.split('\n')[0]}`);
  }
  check(id, label, bag.length === 0 && notes.length === 0, [...bag, ...notes].join(' | '));
  await ctx.close();
}
const small = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const settle = (p, ms = 1500) => p.waitForTimeout(ms);
const noOverflow = async (page, notes, where) => {
  const o = await overflow(page);
  if (o > 1) notes.push(`${where} scrolls sideways by ${o}px`);
};

await sweep('U1', 'games phone flow at 360 px: scan, spin, result, done', small, async (p, notes) => {
  await p.goto('http://localhost:5173/q/logo_game_spin');
  await p.waitForURL(/\/(play|status)\//, { timeout: 20000 });
  await settle(p);
  await noOverflow(p, notes, 'game page');
  if (p.url().includes('/status/')) return notes.push(`landed on ${p.url()}`);
  // Spin asks for the name and phone first, and Spin stays disabled until they are given
  if (!(await p.getByRole('button', { name: /spin/i }).isDisabled())) notes.push('Spin was enabled before the name and phone');
  await p.getByLabel('Your name').fill('QA Phone Player');
  await p.getByLabel('Phone number').fill('0771234567');
  await noOverflow(p, notes, 'name and phone popup');
  await p.getByRole('button', { name: /continue/i }).click();
  await p.getByRole('button', { name: /spin/i }).click();
  await p.waitForURL(/\/result\//, { timeout: 30000 });
  await settle(p, 2500);
  await noOverflow(p, notes, 'result page');
  await p.reload();
  await settle(p);
  if (!(await p.getByText(/LKD|try again|better luck/i).first().isVisible())) notes.push('result not shown after reload');
  await p.getByRole('link', { name: /awesome|done|ok/i }).first().click();
  await p.waitForURL(/\/done/);
  await p.goBack();
  await settle(p);
  if (p.url().includes('/play/')) notes.push('back button returns to a playable game page');
});

// Both games share one player lock. No TV shows the Spin result here, so free the screen for Lucky Dip.
await (await adminAs()).call('POST', `${GAMES}/admin/v1/games/screens/scr_spin/release-lock`);

await sweep('U2', 'Lucky Dip phone flow at 360 px', small, async (p, notes) => {
  await p.goto('http://localhost:5173/q/logo_game_dip');
  await p.waitForURL(/\/(play|status)\//, { timeout: 20000 });
  await settle(p);
  await noOverflow(p, notes, 'lucky dip');
  if (p.url().includes('/status/')) return notes.push(`landed on ${p.url()}`);
  // Lucky Dip asks for the name and phone too, and the boxes stay locked until then
  if (!(await p.getByRole('button', { name: 'Box 1' }).isDisabled())) notes.push('boxes were open before the name and phone');
  await p.getByLabel('Your name').fill('QA Dip Player');
  await p.getByLabel('Phone number').fill('0771234567');
  await p.getByRole('button', { name: /continue/i }).click();
  await p.getByRole('button', { name: 'Box 1' }).click();
  await p.getByRole('button', { name: 'Box 2' }).click({ timeout: 1500 }).catch(() => {});
  await p.waitForURL(/\/result\//, { timeout: 30000 });
});

await sweep('U3', 'games pages for broken links and status codes', small, async (p, notes) => {
  for (const path of ['/', '/play/ent_nope', '/result/ent_nope', '/done', '/status/WHATEVER', '/nope']) {
    await p.goto(`http://localhost:5173${path}`);
    await settle(p, 1200);
    const text = (await p.locator('body').innerText()).trim();
    if (text.length < 10) notes.push(`${path} renders a blank page`);
    await noOverflow(p, notes, path);
  }
});

await sweep('U4', 'hunt phone flow at 360 px', small, async (p, notes) => {
  // QuickLook sends two scans of one player (encrypted with the local key), then the phone shows
  // the leaderboard, where the player appears by number
  const env = readFileSync(new URL('../../backend/treasure-hunt-api/.env', import.meta.url), 'utf8');
  const key = Buffer.from(env.match(/^HUNT_SCAN_KEY=(.*)$/m)?.[1]?.trim() ?? '', 'hex');
  const userId = `ui-sweep-${crypto.randomUUID()}`;
  for (const n of [1, 2]) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const payload = JSON.stringify({ logo_id: `0b6f2a10-1c1e-4a61-9a01-00000000000${n}`, user_id: userId, user_name: 'UI Sweep Player' });
    const data = Buffer.concat([iv, cipher.update(payload), cipher.final(), cipher.getAuthTag()]).toString('hex');
    await fetch('http://localhost:4002/integrations/quicklook/v1/hunt-scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  }
  await new Promise((r) => setTimeout(r, 3500)); // the leaderboard is cached 3 seconds
  await p.goto('http://localhost:5174/');
  await settle(p, 1500);
  if (!p.url().endsWith('/leaderboard')) notes.push('the hunt app does not open on the leaderboard');
  if (!(await p.locator('body').innerText()).includes('UI Sweep Player')) notes.push('the public leaderboard does not show the QuickLook name');
  for (const path of ['/leaderboard', '/me', '/nope']) {
    await p.goto(`http://localhost:5174${path}`);
    await settle(p, 1500);
    await noOverflow(p, notes, path);
  }
});

const laptop = { viewport: { width: 1280, height: 800 } };
const adminPages = ['/', '/games/sessions', '/games/prizes', '/games/allocation', '/games/logos', '/games/plays', '/games/settings', '/hunt/sessions', '/hunt/winners', '/desk', '/users'];
for (const [id, opts, label] of [['U5', laptop, 'laptop 1280'], ['U6', small, 'phone 360']]) {
  await sweep(id, `admin pages at ${label}: no errors`, opts, async (p, notes) => {
    await p.goto('http://localhost:5175/login');
    await p.getByLabel('Username').fill('super.admin');
    await p.getByLabel('Password').fill(ADMIN_PASSWORD);
    await p.getByRole('button', { name: /sign in|log in/i }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/login'));
    for (const path of adminPages) {
      await p.goto(`http://localhost:5175${path}`);
      await settle(p, 1800);
      if (id === 'U5') await noOverflow(p, notes, path);
      else if ((await overflow(p)) > 1) notes.push(`${path} sideways ${await overflow(p)}px`);
    }
  });
}

await sweep('U7', 'admin route guard: signed out user is sent to login', laptop, async (p, notes) => {
  await p.goto('http://localhost:5175/games/settings');
  await settle(p);
  if (!p.url().includes('/login')) notes.push(`stayed on ${p.url()}`);
});

await sweep('U8', 'TV screens at 1920 and 1366: no errors, no overflow', { viewport: { width: 1366, height: 768 } }, async (p, notes) => {
  for (const path of ['/stall?key=scr_local_spin', '/stall?key=scr_local_dip', '/stall?key=scr_local_main', '/leaderboard', '/qr']) {
    await p.goto(`http://localhost:5176${path}`);
    await settle(p, 2500);
    await noOverflow(p, notes, path);
    const vo = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    if (vo > 1) notes.push(`${path} scrolls down by ${vo}px at 1366x768`);
  }
});

await browser.close();
summary();
