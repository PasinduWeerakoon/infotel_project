// Treasure Hunt load test of a deployed environment, shaped like the event and then checked to
// the last scan. Thousands of QuickLook users scan stall logos (QuickLook's backend sends every
// scan to our API, encrypted), with repeats, the same scan sent in parallel, resent event IDs and
// a few bad messages, while phones and screens poll the leaderboard and staff watch the live view.
//
// Afterwards every user's logo count and scan total must match exactly what was sent, the public
// top 10 must match the admin standings, and the winners must be the top players. Then it deletes
// everything it made: its session, participants, scans, event IDs and test logos.
//
//   STATE_DIR=.state-1bt AWS_PROFILE=1bt-training TARGET_RPS=150 HOLD_S=180 node hunt-load-test.mjs
//
// Only run it while no real hunt session is planned for the next hour: it opens a "Load test" session.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const STATE_DIR = process.env.STATE_DIR ?? '.state';
const TARGET_RPS = Number(process.env.TARGET_RPS ?? 150);
const RAMP_S = Number(process.env.RAMP_S ?? 30);
const HOLD_S = Number(process.env.HOLD_S ?? 180);
const USERS = Number(process.env.USERS ?? 4000);
const LOGOS = Number(process.env.LOGOS ?? 40);
const MAX_IN_FLIGHT = 800;
const TABLE = 'lkdr-dev-treasure-hunt';

const load = (file) =>
  Object.fromEntries(
    readFileSync(new URL(`./${STATE_DIR}/${file}`, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
const urls = load('urls.env');
const { ADMIN_PASSWORD, HUNT_SCAN_KEY } = load('secrets.env');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-south-1' }));

// ------------------------------------------------------------------ measuring
const stats = new Map();
const perSecond = new Map();
let inFlight = 0;
let dropped = 0;
const started = Date.now();
function record(name, status, code, ms) {
  const s = stats.get(name) ?? { n: 0, codes: new Map(), ms: [] };
  s.n++;
  const key = code ? `${status} ${code}` : String(status);
  s.codes.set(key, (s.codes.get(key) ?? 0) + 1);
  s.ms.push(ms);
  stats.set(name, s);
  const second = Math.floor((Date.now() - started) / 1000);
  perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
}
async function call(name, method, url, body, headers = {}) {
  const t = performance.now();
  let status = 0;
  let code = '';
  let data = null;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    data = await res.json().catch(() => null);
    code = data?.error?.code ?? data?.result ?? '';
  } catch (error) {
    code = error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
  }
  record(name, status, code, performance.now() - t);
  return { status, code, data };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ setup
const A = (path) => `${urls.API_URL}${path}`;
const loginRes = await fetch(A('/admin/v1/auth/login'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-lkdr-admin': '1' },
  body: JSON.stringify({ username: 'super.admin', password: ADMIN_PASSWORD }),
});
if (loginRes.status !== 200) throw new Error(`Admin sign in failed: ${loginRes.status}`);
const adminHeaders = { 'x-lkdr-admin': '1', cookie: loginRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
const adm = (name, method, path, body) => call(name, method, A(`/admin/v1/hunt${path}`), body, adminHeaders);

const running = (await call('setup', 'GET', A('/hunt/v1/status'))).data?.session;
if (running && running.state === 'open') throw new Error(`A hunt session is open (${running.name}). Run the load test when none is.`);

// Test logos, as if loaded from QuickLook (removed at the end)
const logoIds = Array.from({ length: LOGOS }, (_, i) => `loadtest-logo-${String(i + 1).padStart(3, '0')}`);
const unknownLogo = 'loadtest-not-an-event-logo';
async function batchWrite(requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let chunk = requests.slice(i, i + 25);
    for (let attempt = 0; chunk.length && attempt < 10; attempt++) {
      if (attempt) await sleep(100 * 2 ** attempt);
      const res = await db.send(new BatchWriteCommand({ RequestItems: { [TABLE]: chunk } }));
      chunk = res.UnprocessedItems?.[TABLE] ?? [];
    }
    if (chunk.length) throw new Error('DynamoDB did not take every write');
  }
}
await batchWrite(logoIds.map((logoId, i) => ({ PutRequest: { Item: { PK: 'LOGOS', SK: `LOGO#${logoId}`, logoId, productName: `Load test stall ${i + 1}`, companyName: 'Load test', logoCode: null, logoUrl: null } } })));

const colombo = (d) => {
  const v = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${v.year}-${v.month}-${v.day}`, time: `${v.hour}:${v.minute}` };
};
const from = colombo(new Date(Date.now() + 120_000));
const to = colombo(new Date(Date.now() + (RAMP_S + HOLD_S + 1800) * 1000));
if (to.date !== from.date) throw new Error('Too close to midnight in Colombo for a one-day session');
const created = await adm('setup', 'POST', '/sessions', { name: 'Load test', date: from.date, start: from.time, end: to.time, pointsPerStall: 10, winnersCount: 3, prizes: [{ rank: 1, prizeName: 'Load test prize' }], allowPreviousWinners: true });
if (created.status !== 201) throw new Error(`Could not create the session: ${created.status} ${created.code}`);
const sessionId = created.data.sessionId;
const opened = await adm('setup', 'POST', `/sessions/${sessionId}/start`);
if (opened.status !== 200) throw new Error(`Could not start the session: ${opened.status} ${opened.code}`);
console.log(`Session ${sessionId} open, ${LOGOS} test logos. Waiting 65 s for every scan handler to see the new logos...`);
await sleep(65_000);

// ------------------------------------------------------------------ what QuickLook and visitors do
function encrypt(payload, keyHex = HUNT_SCAN_KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}
const SCAN_URL = A('/integrations/quicklook/v1/hunt-scans');
const users = Array.from({ length: USERS }, (_, i) => ({ id: `loadtest-${randomUUID()}`, name: `Load Test ${i + 1}` }));
const expected = new Map(users.map((u) => [u.id, { logos: new Set(), scans: 0 }])); // what must be counted
const sentEvents = [];
let scansSent = 0;

/** One scan as QuickLook sends it. Returns the payload so it can be resent */
async function sendScan(user, logoId, eventId = `loadtest-evt-${randomUUID()}`) {
  const payload = { logo_id: logoId, user_id: user.id, user_name: user.name, scanned_at: new Date().toISOString(), event_id: eventId };
  const r = await call('scan', 'POST', SCAN_URL, { data: encrypt(payload) });
  // Only event logos count towards a participant (a non-event logo is kept as a scan record only)
  if (r.status === 200 && r.data?.result !== 'already-received' && logoIds.includes(logoId)) {
    const e = expected.get(user.id);
    e.scans++;
    e.logos.add(logoId);
  }
  scansSent++;
  sentEvents.push(eventId);
  return r;
}
const randomUser = () => users[Math.floor(Math.random() ** 1.6 * USERS)]; // some users scan much more
const randomLogo = () => logoIds[Math.floor(Math.random() * LOGOS)];

const OPS = [
  // QuickLook sends a scan (some are repeats of a logo the user already has)
  [55, () => sendScan(randomUser(), randomLogo())],
  // The same scan arrives 3 times at once (QuickLook retrying a slow request)
  [6, async () => {
    const u = randomUser();
    const logo = randomLogo();
    const id = `loadtest-evt-${randomUUID()}`;
    await Promise.all([sendScan(u, logo, id), sendScan(u, logo, id), sendScan(u, logo, id)]);
  }],
  // A resent event ID from earlier
  [3, () => (sentEvents.length ? sendScan(randomUser(), randomLogo(), sentEvents[Math.floor(Math.random() * sentEvents.length)]) : Promise.resolve())],
  // A logo that is not an event logo, and a message made with the wrong key
  [1, () => sendScan(randomUser(), unknownLogo)],
  [1, () => call('scan wrong key', 'POST', SCAN_URL, { data: encrypt({ logo_id: randomLogo(), user_id: 'x' }, randomBytes(32).toString('hex')) })],
  // Phones and the big screen poll the leaderboard through CloudFront, plus the status
  [26, () => call('leaderboard', 'GET', `${urls.HUNT_URL}/hunt/v1/leaderboard?top=10`)],
  [5, () => call('status', 'GET', `${urls.HUNT_URL}/hunt/v1/status`)],
  // Staff watch the live view
  [3, () => adm('admin live', 'GET', `/sessions/${sessionId}/live`)],
];
const totalWeight = OPS.reduce((s, [w]) => s + w, 0);
const pick = () => {
  let r = Math.random() * totalWeight;
  for (const [w, op] of OPS) if ((r -= w) < 0) return op;
  return OPS[0][1];
};
const REQ_PER_OP = 1.12;

// ------------------------------------------------------------------ run
console.log(`Load: ramp to ${TARGET_RPS} requests a second over ${RAMP_S} s, hold ${HOLD_S} s, ${USERS} users`);
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
    opDebt += (TARGET_RPS * Math.min(1, s / RAMP_S)) / REQ_PER_OP / 20;
    while (opDebt >= 1) {
      opDebt--;
      if (inFlight >= MAX_IN_FLIGHT) {
        dropped++;
        continue;
      }
      inFlight++;
      pick()().finally(() => inFlight--);
    }
    if (Math.floor(s * 20) % 300 === 0) {
      const last = perSecond.get(Math.floor((Date.now() - started) / 1000) - 1) ?? 0;
      console.log(`  ${Math.floor(s)} s: ${last} requests in the last second, ${inFlight} in flight`);
    }
  }, 50);
});
while (inFlight > 0) await sleep(200);

// ------------------------------------------------------------------ check every user, exactly
const checks = [];
const check = (label, ok, detail = '') => {
  checks.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  >> ${detail}`}`);
};
console.log('\nChecking the standings against every scan sent...');
await sleep(4000);
const parts = (await adm('setup', 'GET', `/sessions/${sessionId}/participants`)).data?.items ?? [];
const byId = new Map(parts.map((p) => [p.userId, p]));
const active = [...expected].filter(([, e]) => e.scans > 0);
const wrongLogos = active.filter(([id, e]) => (byId.get(id)?.stalls ?? 0) !== e.logos.size);
const wrongScans = active.filter(([id, e]) => {
  const p = byId.get(id);
  return p?.totalScans !== e.scans;
});
check(`every user's logo count is exact (${active.length} users)`, wrongLogos.length === 0, JSON.stringify(wrongLogos.slice(0, 3).map(([id, e]) => ({ id, expected: e.logos.size, got: byId.get(id)?.stalls }))));
check('every user\'s scan total is exact (repeats in, resent event IDs out)', wrongScans.length === 0, JSON.stringify(wrongScans.slice(0, 3).map(([id, e]) => ({ id, expected: e.scans, got: byId.get(id)?.totalScans }))));
check('points are 10 per logo for everyone', parts.every((p) => p.points === p.stalls * 10), '');
const numbers = parts.map((p) => p.playerNumber);
check(`player numbers unique, none missing (${parts.length} players)`, new Set(numbers).size === numbers.length && Math.min(...numbers) === 1 && Math.max(...numbers) === numbers.length, `max #${Math.max(...numbers)}, ${numbers.filter((n) => !n).length} at #0`);
const ranked = parts.filter((p) => p.rank).sort((a, b) => a.rank - b.rank);
const sorted = ranked.every((p, i) => i === 0 || ranked[i - 1].stalls > p.stalls || (ranked[i - 1].stalls === p.stalls && ranked[i - 1].reachedAt <= p.reachedAt));
check('standings sorted by logos, then by who got there first', sorted);
await sleep(3500);
const lb = (await call('setup', 'GET', A(`/hunt/v1/leaderboard?sessionId=${sessionId}&top=10`))).data;
check('public top 10 matches the admin standings', lb?.top?.length === Math.min(10, ranked.length) && lb.top.every((r, i) => r.playerNumber === ranked[i].playerNumber && r.stalls === ranked[i].stalls), JSON.stringify({ lb: lb?.top?.slice(0, 3), admin: ranked.slice(0, 3).map((p) => [p.playerNumber, p.stalls]) }));
const live = (await adm('setup', 'GET', `/sessions/${sessionId}/live`)).data;
check('live view player count matches', live?.players === parts.length, `${live?.players} vs ${parts.length}`);

// The end: winners are the top 3 and are flagged
await adm('setup', 'POST', `/sessions/${sessionId}/end`);
console.log('Session ended. Waiting for the winners (30 s grace, then the next job run)...');
let winners = [];
for (let i = 0; i < 30 && winners.length === 0; i++) {
  await sleep(5000);
  winners = (await adm('setup', 'GET', `/sessions/${sessionId}/winners`)).data?.items ?? [];
}
check('winners are worked out after the end and are the top 3', winners.length === 3 && winners.every((w, i) => w.userId === ranked[i]?.userId), JSON.stringify(winners.map((w) => [w.rank, w.playerNumber, w.stalls])));
const flagged = ((await adm('setup', 'GET', `/sessions/${sessionId}/participants`)).data?.items ?? []).filter((p) => p.winnerRank);
check('winners are flagged on the participants', flagged.length === 3, String(flagged.length));
const late = await sendScan(users[0], logoIds[0]);
check('a scan after the end does not count', late.data?.result === 'no-session', JSON.stringify(late.data));

// ------------------------------------------------------------------ report
const pct = (list, p) => Math.round([...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor((p / 100) * list.length))] ?? 0);
const hold = [...perSecond].filter(([sec]) => sec > (runStart - started) / 1000 + RAMP_S && sec < (runStart - started) / 1000 + RAMP_S + HOLD_S);
const report = {
  target: TARGET_RPS,
  holdAverageRps: Math.round(hold.reduce((s, [, n]) => s + n, 0) / Math.max(1, hold.length)),
  users: USERS,
  activeUsers: active.length,
  scansSent,
  dropped,
  endpoints: [...stats].filter(([n]) => n !== 'setup').map(([name, s]) => ({ name, requests: s.n, p50: pct(s.ms, 50), p95: pct(s.ms, 95), p99: pct(s.ms, 99), max: Math.round(Math.max(...s.ms)), codes: Object.fromEntries(s.codes) })),
  checks,
};
const failures = report.endpoints.flatMap((e) => Object.entries(e.codes).filter(([k]) => /^(5|0|429)/.test(k)).map(([k, n]) => `${e.name}: ${k} x${n}`));
console.log(`\nAverage while holding: ${report.holdAverageRps} requests a second (target ${TARGET_RPS}), ${scansSent} scans sent, ${dropped} skipped`);
console.log('endpoint             requests   p50   p95   p99    max  responses');
for (const e of report.endpoints) console.log(`${e.name.padEnd(19)} ${String(e.requests).padStart(9)} ${String(e.p50).padStart(5)} ${String(e.p95).padStart(5)} ${String(e.p99).padStart(5)} ${String(e.max).padStart(6)}  ${Object.entries(e.codes).map(([k, n]) => `${k} x${n}`).join(', ')}`);
console.log(failures.length ? `\nFAILURES (5xx, throttling, timeouts, network):\n  ${failures.join('\n  ')}` : '\nNo 5xx, throttling, timeouts or network errors');
console.log(checks.every((c) => c.ok) ? 'Every standings check passed' : `${checks.filter((c) => !c.ok).length} standings check(s) FAILED`);
const file = new URL(`./${STATE_DIR}/hunt-load-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`Report saved to ${file.pathname}`);

// ------------------------------------------------------------------ clean up everything it made
console.log('\nRemoving the load test data...');
async function keysOf(pk, onlyLoadTest = false) {
  const out = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk }, ProjectionExpression: 'PK, SK, userId', ExclusiveStartKey }));
    out.push(...(page.Items ?? []).filter((i) => !onlyLoadTest || String(i.userId ?? '').startsWith('loadtest-')).map(({ PK, SK }) => ({ PK, SK })));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}
const doomed = [
  ...(await keysOf(`SESSION#${sessionId}`)),
  ...(await keysOf(`SCANS#${sessionId}`)),
  ...(await keysOf('LOGOS')).filter((k) => k.SK.startsWith('LOGO#loadtest-')),
  ...[...new Set(sentEvents)].map((id) => ({ PK: `EVENT#${id}`, SK: 'META' })),
];
// The late scan after the end is kept under the day, outside any session: only the load test's own
doomed.push(...(await keysOf(`SCANS#NONE#${colombo(new Date()).date}`, true)));
await batchWrite(doomed.map((Key) => ({ DeleteRequest: { Key } })));
console.log(`Deleted ${doomed.length} items (session, participants, scans, event IDs, test logos)`);
process.exitCode = checks.every((c) => c.ok) && failures.length === 0 ? 0 : 1;
