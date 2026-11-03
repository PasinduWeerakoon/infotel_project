/**
 * Builds a printable QR sheet for phone testing from the deployed addresses (.state/urls.env).
 * Each logo QR opens our app at /q/{logoId}, like QuickLook's redirect (without its token, so each
 * phone gets its own test player).
 * Output: project/test-kit/qr-sheet.html (print it, or open it on a laptop and scan from the screen).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'test-kit');

const readEnv = async (file: string) =>
  Object.fromEntries(
    (await readFile(join(here, process.env.STATE_DIR ?? '.state', file), 'utf8'))
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

const urls = await readEnv('urls.env');
const secrets = await readEnv('secrets.env');

const LOGOS = [
  { id: 'logo_game_spin', name: 'Spin the Wheel', kind: 'Game', app: 'games' },
  { id: 'logo_game_dip', name: 'Lucky Dip', kind: 'Game', app: 'games' },
  // Treasure Hunt stalls have no QR codes: visitors scan the real logos with the QuickLook app
];

const SCREENS = [
  { name: 'Main display, both games live (16:9 display)', url: urls.GAMES_URL },
  { name: 'QR board, game codes (16:9 display)', url: `${urls.SCREENS_URL}/qr` },
  { name: 'Spin the Wheel stall screen', url: `${urls.SCREENS_URL}/stall?key=${secrets.SCREEN_KEY_SPIN}` },
  { name: 'Lucky Dip stall screen', url: `${urls.SCREENS_URL}/stall?key=${secrets.SCREEN_KEY_DIP}` },
  { name: 'Leaderboard screen', url: `${urls.SCREENS_URL}/leaderboard` },
  { name: 'Admin panel (super.admin)', url: urls.ADMIN_URL },
];

const qr = (text: string) => QRCode.toDataURL(text, { margin: 1, width: 360, color: { dark: '#170e3f', light: '#ffffff' } });

const cards = await Promise.all(
  LOGOS.map(async (logo) => {
    const url = `${logo.app === 'hunt' ? urls.HUNT_URL : urls.GAMES_URL}/q/${logo.id}`;
    return `<div class="card"><span class="kind">${logo.kind}</span><img src="${await qr(url)}" alt=""><strong>${logo.name}</strong><small>${logo.id}</small></div>`;
  }),
);
const links = await Promise.all(
  SCREENS.map(async (s) => `<div class="link"><img src="${await qr(s.url)}" alt=""><div><strong>${s.name}</strong><code>${s.url}</code></div></div>`),
);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LKDR test QR sheet</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #170e3f; margin: 24px; }
  h1 { margin: 0 0 4px; } p { margin: 0 0 18px; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .card { border: 2px solid #5a3ad1; border-radius: 16px; padding: 12px; text-align: center; display: flex; flex-direction: column; gap: 6px; break-inside: avoid; }
  .card img { width: 100%; }
  .kind { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #5a3ad1; }
  small { color: #777; }
  h2 { margin: 28px 0 12px; }
  .link { display: flex; gap: 14px; align-items: center; border: 1px solid #ddd; border-radius: 12px; padding: 10px; margin-bottom: 10px; break-inside: avoid; }
  .link img { width: 110px; } code { display: block; font-size: 11px; word-break: break-all; color: #555; margin-top: 4px; }
  @media print { body { margin: 10mm; } h2 { break-before: page; } }
</style></head><body>
<h1>LKDR test QR sheet</h1>
<p>Scan with the phone camera. Each phone is one test player (one game per session). Use another phone to play again in the same session.</p>
<div class="grid">${cards.join('')}</div>
<h2>Screens and admin (open on a laptop or TV)</h2>
${links.join('')}
<p>Admin password: in apps/deploy-test/${process.env.STATE_DIR ?? '.state'}/secrets.env (ADMIN_PASSWORD). Test environment only.</p>
</body></html>`;

await mkdir(out, { recursive: true });
// .state gives qr-sheet.html, .state-1bt gives qr-sheet-1bt.html
const sheet = `qr-sheet${(process.env.STATE_DIR ?? '.state').replace(/^\.state/, '')}.html`;
await writeFile(join(out, sheet), html);
console.log(`QR sheet written to ${join(out, sheet)}`);
