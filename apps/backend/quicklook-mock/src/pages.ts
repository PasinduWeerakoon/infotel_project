/**
 * HTML pages of the QuickLook mock: the sign in page and the "QuickLook app" scan simulator.
 */
interface User {
  sub: string;
  givenName: string;
}

interface Logo {
  logoId: string;
  name: string;
  logoType: string;
  imageUrl: string | null;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
  body { margin: 0; background: #f4f4f5; color: #18181b; }
  main { max-width: 420px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 8px 0 4px; }
  p { color: #52525b; margin: 0 0 16px; line-height: 1.5; }
  .tag { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: #fff; background: #18181b; padding: 4px 8px; border-radius: 6px; }
  .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; padding: 16px; margin-bottom: 12px; }
  button, select { font: inherit; }
  .btn { width: 100%; height: 48px; border-radius: 12px; border: 0; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
  .btn.alt { background: #fff; color: #18181b; border: 1px solid #a1a1aa; }
  .row { display: flex; gap: 8px; align-items: center; }
  .logo { width: 56px; height: 56px; border-radius: 12px; background: #e4e4e7; object-fit: cover; flex: none; }
  .grow { flex: 1; min-width: 0; }
  .muted { font-size: 13px; color: #71717a; }
  label { display: flex; gap: 8px; align-items: center; font-size: 14px; color: #3f3f46; margin-top: 8px; }
</style></head><body><main>${body}</main></body></html>`;

export function signInPage(users: User[], authorizeParams: string): string {
  const options = users
    .map((u) => `<option value="${u.sub}">${escapeHtml(u.givenName)} (${u.sub})</option>`)
    .join('');
  return layout(
    'QuickLook sign in (mock)',
    `<span class="tag">QUICKLOOK MOCK</span>
     <h1>Sign in to QuickLook</h1>
     <p>Local test only. Pick a test visitor. The app receives only the opaque ID and the first name.</p>
     <form method="post" action="/authorize" class="card">
       <input type="hidden" name="authorize" value="${escapeHtml(authorizeParams)}">
       <select name="sub" style="width:100%;height:44px;border-radius:10px;margin-bottom:12px">${options}</select>
       <button class="btn" type="submit">Sign in</button>
     </form>`,
  );
}

interface HuntLogo {
  logo_id: string;
  product_name: string;
  company_name: string | null;
  logo_code: string | null;
}

export function simulatorPage(
  users: User[],
  current: string | undefined,
  logos: Logo[],
  huntLogos: HuntLogo[],
  huntScanned: string | null,
): string {
  const options = users
    .map(
      (u) =>
        `<option value="${u.sub}" ${u.sub === current ? 'selected' : ''}>${escapeHtml(u.givenName)}</option>`,
    )
    .join('');
  const logoCards = logos.length
    ? logos
        .map(
          (logo) => `<form method="post" action="/simulate/scan" class="card">
            <input type="hidden" name="logoId" value="${escapeHtml(logo.logoId)}">
            <input type="hidden" name="logoType" value="${escapeHtml(logo.logoType)}">
            <div class="row">
              ${logo.imageUrl ? `<img class="logo" src="${escapeHtml(logo.imageUrl)}" alt="">` : '<div class="logo"></div>'}
              <div class="grow"><strong>${escapeHtml(logo.name)}</strong><div class="muted">${escapeHtml(logo.logoId)} (${logo.logoType})</div></div>
            </div>
            <label><input type="checkbox" name="late" value="1"> Send the scan event 1.5 s late</label>
            <button class="btn" type="submit" style="margin-top:12px">Scan this logo</button>
          </form>`,
        )
        .join('')
    : '<div class="card"><p>No logos yet. Start the platform API and run its db:setup, or add logos in the admin dashboard.</p></div>';

  return layout(
    'QuickLook app simulator',
    `<span class="tag">QUICKLOOK MOCK</span>
     <h1>QuickLook app simulator</h1>
     <p>Pick who is scanning, then tap a logo. The mock sends the signed scan event to our platform API, then opens the logo link, like the real app.</p>
     <form method="post" action="/simulate/switch-user" class="card row">
       <select name="sub" class="grow" style="height:44px;border-radius:10px">${options}</select>
       <button class="btn alt" type="submit" style="width:auto;padding:0 16px">Use</button>
     </form>
     ${current ? `<p class="muted">Signed in to QuickLook as ${escapeHtml(current)}. Sign in on our apps will be silent.</p>` : '<p class="muted">Not signed in to QuickLook yet. Our apps will show the QuickLook sign in once.</p>'}
     ${logoCards}
     <h2 style="margin-top:28px">Treasure Hunt logos (QuickLook leaderboard)</h2>
     <p class="muted">These scans go only to the mock leaderboard API. The hunt reads them about every 15 seconds. Select the first eight in the admin dashboard (Treasure Hunt, Sessions, Logos). The last four are unrelated logos.</p>
     ${huntScanned ? `<p class="tag">Scanned ${escapeHtml(huntScanned)}</p>` : ''}
     ${huntLogos
       .map(
         (logo) => `<form method="post" action="/simulate/hunt-scan" class="card row">
            <input type="hidden" name="logoId" value="${escapeHtml(logo.logo_id)}">
            <div class="grow"><strong>${escapeHtml(logo.product_name)}</strong><div class="muted">${escapeHtml(logo.company_name ?? 'Company hidden')} ${escapeHtml(logo.logo_code ?? '')}</div></div>
            <button class="btn" type="submit" style="width:auto;padding:0 16px">Scan</button>
          </form>`,
       )
       .join('')}`,
  );
}

/**
 * Demo control room (local only): a phone running the QuickLook simulator and the visitor apps,
 * next to the live stall screen and leaderboard screen, so the whole flow is visible at once.
 */
export function demoPage(urls: { games: string; hunt: string; admin: string; screens: string }): string {
  const tab = (href: string, label: string) =>
    `<a class="tab" href="${href}" target="_blank" rel="noopener">${label}</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LKDR demo control room</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #fff; min-height: 100vh;
    background: radial-gradient(60% 45% at 15% 0%, rgb(155 92 255 / .5), transparent 70%), linear-gradient(180deg, #241565, #170e3f); }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; }
  h1 { margin: 0; font-size: 22px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  .tab { color: #fff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 8px 14px; border-radius: 999px;
    background: rgb(255 255 255 / .12); border: 1px solid rgb(255 255 255 / .2); }
  .tab.admin { background: #ffcd1f; color: #3a2400; border-color: #ffcd1f; }
  main { display: grid; grid-template-columns: 400px 1fr; gap: 20px; padding: 0 24px 24px; }
  .phone { width: 400px; height: 820px; border-radius: 52px; padding: 14px; background: #0d0826;
    box-shadow: 0 0 0 2px #3b2f7a, 0 30px 80px -20px rgb(0 0 0 / .7); }
  .phone iframe { width: 100%; height: 100%; border: 0; border-radius: 40px; background: #170e3f; }
  .screens { display: grid; grid-template-rows: auto auto; gap: 20px; min-width: 0; }
  .tv { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .tv span { font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #ffcd1f; }
  .tv iframe { width: 100%; aspect-ratio: 16 / 9; border: 6px solid #0d0826; border-radius: 14px; background: #170e3f; }
  .steps { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .step { background: rgb(255 255 255 / .08); border: 1px solid rgb(255 255 255 / .15); border-radius: 14px; padding: 12px 14px; font-size: 14px; line-height: 1.45; }
  .step b { color: #ffcd1f; }
  button { font: inherit; font-weight: 700; border: 0; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
  @media (max-width: 1000px) { main { grid-template-columns: 1fr; } .phone { margin: 0 auto; } }
</style></head><body>
<header>
  <h1>LKDR demo control room</h1>
  <nav class="tabs">
    ${tab(urls.admin, 'Admin panel (super.admin)')}
    ${tab('/', 'QuickLook simulator')}
    ${tab(`${urls.games}/`, 'Games app')}
    ${tab(`${urls.hunt}/me`, 'Treasure Hunt app')}
    ${tab(`${urls.screens}/stall?key=scr_local_spin`, 'Spin screen')}
    ${tab(`${urls.screens}/stall?key=scr_local_dip`, 'Lucky Dip screen')}
    ${tab(`${urls.screens}/leaderboard`, 'Leaderboard screen')}
  </nav>
</header>
<main>
  <div>
    <div class="phone"><iframe id="phone" src="/" title="Visitor phone"></iframe></div>
    <p style="text-align:center;margin:10px 0 0">
      <button onclick="document.getElementById('phone').src='/'">Back to QuickLook</button>
      <button onclick="document.getElementById('phone').src='${urls.hunt}/me'">My hunt progress</button>
    </p>
  </div>
  <div class="screens">
    <div class="tv"><span>Stall screen</span>
      <select id="stall" onchange="document.getElementById('stallFrame').src=this.value" style="align-self:flex-start;border-radius:999px;padding:6px 10px">
        <option value="${urls.screens}/stall?key=scr_local_spin">Spin the Wheel stall</option>
        <option value="${urls.screens}/stall?key=scr_local_dip">Lucky Dip stall</option>
      </select>
      <iframe id="stallFrame" src="${urls.screens}/stall?key=scr_local_spin" title="Stall screen"></iframe>
    </div>
    <div class="tv"><span>Treasure Hunt leaderboard screen</span>
      <iframe src="${urls.screens}/leaderboard" title="Leaderboard screen"></iframe>
    </div>
  </div>
  <section class="steps">
    <div class="step"><b>1. Pick a visitor</b> in the phone and press Use. Each visitor can play once per session.</div>
    <div class="step"><b>2. Scan Spin the Wheel</b>. Watch the stall screen show "Get ready", then tap SPIN on the phone.</div>
    <div class="step"><b>3. Win</b>. The phone shows the prize and reference. The stall screen shows the same prize, never the reference.</div>
    <div class="step"><b>4. Scan Lucky Dip</b> with the same visitor: "already played this session". Switch the stall screen to Lucky Dip and try another visitor.</div>
    <div class="step"><b>5. Treasure Hunt</b>: back to QuickLook, scan stall logos. Points appear on the phone and the leaderboard screen.</div>
    <div class="step"><b>6. Admin panel</b>: open it (yellow tab), sign in as super.admin. Find the reference in Prize desk, see Overview, Allocation, Winners.</div>
  </section>
</main>
</body></html>`;
}

/** What a printed QR code shows the first time: pick which test visitor this phone is. */
export function scanSignInPage(users: User[], action: string, logoName: string): string {
  const buttons = users
    .map(
      (u) =>
        `<button class="btn alt" type="submit" name="sub" value="${u.sub}" style="margin-bottom:8px">${escapeHtml(u.givenName)}</button>`,
    )
    .join('');
  return layout(
    'QuickLook (test)',
    `<span class="tag">QUICKLOOK TEST</span>
     <h1>Scanning: ${escapeHtml(logoName)}</h1>
     <p>Test sign in. Pick who you are on this phone. Next scans remember you.</p>
     <form method="post" action="${escapeHtml(action)}" class="card">${buttons}</form>`,
  );
}
