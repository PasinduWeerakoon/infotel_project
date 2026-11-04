// Load test of a deployed TEST environment, shaped like the event: thousands of phones checking
// the game status, signing in, scanning and trying to play (one player per screen at a time, so
// most attempts get "game in progress"), the Treasure Hunt leaderboard, screens and staff.
// It creates a "Load test" session now and allocates some prizes; clean up afterwards with
// clear-activity.ts. Never point it at production.
// All the traffic comes from this one machine, so deploy with RATE_LIMIT_IP=0 first (the venue
// limit of 600 a minute per IP would refuse most of it), and deploy again without it afterwards.
//
//   STATE_DIR=.state-1bt TARGET_RPS=300 node load-test.mjs
//
// Ramp up for RAMP_S, hold for HOLD_S, then report latency and errors per endpoint.
import { readFileSync, writeFileSync } from 'node:fs';

const STATE_DIR = process.env.STATE_DIR ?? '.state';
const TARGET_RPS = Number(process.env.TARGET_RPS ?? 300);
const RAMP_S = Number(process.env.RAMP_S ?? 60);
const HOLD_S = Number(process.env.HOLD_S ?? 180);
const MAX_IN_FLIGHT = 800;

const load = (file) =>
  Object.fromEntries(
    readFileSync(new URL(`./${STATE_DIR}/${file}`, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
const urls = load('urls.env');
const { ADMIN_PASSWORD } = load('secrets.env');

// ------------------------------------------------------------------ measuring
const stats = new Map(); // name -> { n, codes: Map, ms: [] }
const perSecond = new Map(); // second -> requests finished
let inFlight = 0;
let dropped = 0;
const started = Date.now();

function record(name, status, code, ms) {
  const s = stats.get(name) ?? { n: 0, codes: new Map(), ms: [] };
  s.n++;
  const key = status >= 500 || status === 0 ? `${status} ${code}` : code ? `${status} ${code}` : String(status);
  s.codes.set(key, (s.codes.get(key) ?? 0) + 1);
  s.ms.push(ms);
  stats.set(name, s);
  const second = Math.floor((Date.now() - started) / 1000);
  perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
}

/** One HTTP call with its own cookie jar; records status, error code and time */
async function call(name, jar, method, url, body, headers = {}) {
  const t = performance.now();
  let status = 0;
  let code = '';
  let data = null;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    data = await res.json().catch(() => null);
    code = data?.error?.code ?? '';
  } catch (error) {
    code = error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
  }
  record(name, status, code, performance.now() - t);
  return { status, code, data };
}

// ------------------------------------------------------------------ setup
const admin = new Map();
const A = (path) => `${urls.API_URL}${path}`;
const adminHeaders = { 'x-lkdr-admin': '1' };
const login = await call('setup', admin, 'POST', A('/admin/v1/auth/login'), { username: 'super.admin', password: ADMIN_PASSWORD }, adminHeaders);
if (login.status !== 200) throw new Error(`Admin sign in failed: ${login.status}`);

const colombo = (d) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${v.year}-${v.month}-${v.day}`, time: `${v.hour}:${v.minute}` };
};
const status0 = await call('setup', admin, 'GET', A('/games/v1/status'));
let sessionId = status0.data?.session?.sessionId;
if (!sessionId) {
  const from = colombo(new Date(Date.now() - 60_000));
  const to = colombo(new Date(Date.now() + (RAMP_S + HOLD_S + 600) * 1000));
  const created = await call('setup', admin, 'POST', A('/admin/v1/games/sessions'), { name: 'Load test', date: from.date, start: from.time, end: to.time, games: ['spin', 'lucky-dip'] }, adminHeaders);
  if (created.status !== 201) throw new Error(`Could not create the load test session: ${created.status} ${created.code}`);
  sessionId = created.data.sessionId;
  // Every prize that has free stock: up to 40 units each, split over both games
  const prizes = (await call('setup', admin, 'GET', A('/admin/v1/games/prizes'), undefined, adminHeaders)).data?.items ?? [];
  const rows = prizes.flatMap((p) => {
    const units = Math.min(40, p.available ?? 0);
    return [
      { game: 'spin', prizeId: p.prizeId, allocated: Math.ceil(units / 2) },
      { game: 'lucky-dip', prizeId: p.prizeId, allocated: Math.floor(units / 2) },
    ];
  });
  const alloc = await call('setup', admin, 'PUT', A(`/admin/v1/games/sessions/${sessionId}/allocation`), { rows }, adminHeaders);
  if (alloc.status !== 200) throw new Error(`Allocation failed: ${alloc.status} ${alloc.code}`);
  console.log(`Created session ${sessionId} with ${rows.reduce((s, r) => s + r.allocated, 0)} prize units`);
  await new Promise((r) => setTimeout(r, 6000)); // status is cached for 5 seconds
}
const screens = (await call('setup', admin, 'GET', A('/admin/v1/games/screens'), undefined, adminHeaders)).data?.items ?? [];
const screenFor = (game) => screens.find((s) => s.games.length === 1 && s.games[0] === game);

// ------------------------------------------------------------------ what a visitor or staff member does
const G = urls.GAMES_URL; // visitors call the API through the games site (same origin, CloudFront)
const games = ['logo_game_spin', 'logo_game_dip'];
let plays = 0;

const OPS = [
  // A phone on the waiting screen polls the status
  [30, async () => call('games status', new Map(), 'GET', `${G}/games/v1/status`)],
  [8, async () => call('logos', new Map(), 'GET', `${G}/platform/v1/logos`)],
  [10, async () => call('hunt leaderboard', new Map(), 'GET', `${urls.HUNT_URL}/hunt/v1/leaderboard?top=10`)],
  // Scan a game logo: sign in, then check the session
  [18, async () => {
    const jar = new Map();
    await call('scan sign in', jar, 'POST', `${G}/auth/v1/scan-login`, { token: `test_${crypto.randomUUID()}`, logoId: games[plays % 2] });
    await call('visitor session', jar, 'GET', `${G}/auth/v1/session`);
  }],
  // Scan and try to play: most get "game in progress" because one player holds each screen
  [24, async () => {
    const jar = new Map();
    const logoId = games[Math.floor(Math.random() * 2)];
    const scan = await call('scan sign in', jar, 'POST', `${G}/auth/v1/scan-login`, { token: `test_${crypto.randomUUID()}`, logoId });
    if (!scan.data?.scanId) return;
    const entry = await call('create entry', jar, 'POST', `${G}/games/v1/entries`, { scanId: scan.data.scanId });
    if (entry.status !== 201) return;
    const play = await call('play', jar, 'POST', `${G}/games/v1/entries/${entry.data.entryId}/play`, { player: { name: 'Load Test', phone: '0770000000' } });
    if (play.status === 200) plays++;
    // Free the screen at once so the next visitor can play (a real turn takes about 30 seconds)
    const screen = screenFor(entry.data.game);
    if (screen) await call('admin release screen', admin, 'POST', A(`/admin/v1/games/screens/${screen.screenId}/release-lock`), undefined, adminHeaders);
  }],
  // Staff: live view and the prize desk
  [5, async () => call('admin live', admin, 'GET', A('/admin/v1/games/live'), undefined, adminHeaders)],
  [5, async () => call('prize desk lookup', admin, 'GET', A('/admin/v1/games/references?q=LKD-AAAA-22'), undefined, adminHeaders)],
];
const totalWeight = OPS.reduce((s, [w]) => s + w, 0);
const pick = () => {
  let r = Math.random() * totalWeight;
  for (const [w, op] of OPS) if ((r -= w) < 0) return op;
  return OPS[0][1];
};
// About 1.4 requests per operation on average, so operations per second are scaled down
const REQ_PER_OP = 1.4;

// ------------------------------------------------------------------ run
console.log(`Load test: ramp to ${TARGET_RPS} requests a second over ${RAMP_S} s, hold ${HOLD_S} s`);
const runStart = Date.now();
let opDebt = 0;
await new Promise((resolve) => {
  const tick = setInterval(() => {
    const s = (Date.now() - runStart) / 1000;
    if (s > RAMP_S + HOLD_S) {
      clearInterval(tick);
      resolve();
      return;
    }
    const rps = TARGET_RPS * Math.min(1, s / RAMP_S);
    opDebt += rps / REQ_PER_OP / 20; // 20 ticks a second
    while (opDebt >= 1) {
      opDebt--;
      if (inFlight >= MAX_IN_FLIGHT) {
        dropped++;
        continue;
      }
      inFlight++;
      pick()().finally(() => inFlight--);
    }
    if (Math.floor(s) % 15 === 0 && Math.floor(s * 20) % 20 === 0) {
      const last = perSecond.get(Math.floor((Date.now() - started) / 1000) - 1) ?? 0;
      console.log(`  ${Math.floor(s)} s: ${last} requests in the last second, ${inFlight} in flight`);
    }
  }, 50);
});
while (inFlight > 0) await new Promise((r) => setTimeout(r, 200));

// ------------------------------------------------------------------ report
const pct = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0);
};
const holdSeconds = [...perSecond].filter(([sec]) => sec > (runStart - started) / 1000 + RAMP_S && sec < (runStart - started) / 1000 + RAMP_S + HOLD_S);
const report = {
  target: TARGET_RPS,
  holdAverageRps: Math.round(holdSeconds.reduce((s, [, n]) => s + n, 0) / Math.max(1, holdSeconds.length)),
  plays,
  dropped,
  endpoints: [...stats].filter(([name]) => name !== 'setup').map(([name, s]) => ({
    name,
    requests: s.n,
    p50: pct(s.ms, 50),
    p95: pct(s.ms, 95),
    p99: pct(s.ms, 99),
    max: Math.round(Math.max(...s.ms)),
    codes: Object.fromEntries(s.codes),
  })),
};
const failures = report.endpoints.flatMap((e) =>
  Object.entries(e.codes).filter(([k]) => k.startsWith('5') || k.startsWith('0') || k.startsWith('429')).map(([k, n]) => `${e.name}: ${k} x${n}`),
);
console.log(`\nAverage while holding: ${report.holdAverageRps} requests a second (target ${TARGET_RPS}), ${plays} plays, ${dropped} skipped (too many in flight)`);
console.log('endpoint                  requests   p50   p95   p99    max  responses');
for (const e of report.endpoints) {
  console.log(`${e.name.padEnd(24)} ${String(e.requests).padStart(9)} ${String(e.p50).padStart(5)} ${String(e.p95).padStart(5)} ${String(e.p99).padStart(5)} ${String(e.max).padStart(6)}  ${Object.entries(e.codes).map(([k, n]) => `${k} x${n}`).join(', ')}`);
}
console.log(failures.length ? `\nFAILURES (5xx, throttling, timeouts, network):\n  ${failures.join('\n  ')}` : '\nNo 5xx, throttling, timeouts or network errors');
const file = new URL(`./${STATE_DIR}/load-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`Report saved to ${file.pathname}`);
