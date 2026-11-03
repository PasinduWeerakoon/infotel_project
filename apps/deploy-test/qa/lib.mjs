// QA harness for the LOCAL run (npm run qa). Never points at AWS.
// Small QA harness: cookie clients for visitors and admins, and pass/fail checks
import { readFileSync } from 'node:fs';

export const PLATFORM = 'http://localhost:4000';
export const GAMES = 'http://localhost:4001';
export const HUNT = 'http://localhost:4002';
const env = readFileSync(new URL('../../backend/platform-api/.env', import.meta.url), 'utf8');
export const ADMIN_PASSWORD = env.match(/^BOOTSTRAP_ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim();

export function client(extraHeaders = {}) {
  const jar = new Map();
  const call = async (method, url, body) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, code: data?.error?.code ?? data?.code, message: data?.error?.message ?? data?.message };
  };
  return { call, jar };
}

export async function visitor(logoId) {
  const v = client();
  const login = await v.call('POST', `${PLATFORM}/auth/v1/scan-login`, { token: `test_${crypto.randomUUID()}`, logoId });
  v.scanId = login.data?.scanId;
  v.login = login;
  v.rescan = async (logo) => {
    const r = await v.call('POST', `${PLATFORM}/auth/v1/scan-login`, { token: v.token, logoId: logo });
    return r.data?.scanId;
  };
  return v;
}

/** A visitor that keeps the same test token, so later scans are the same person */
export async function person() {
  const v = client();
  v.token = `test_${crypto.randomUUID()}`;
  v.scan = async (logoId) => {
    const r = await v.call('POST', `${PLATFORM}/auth/v1/scan-login`, { token: v.token, logoId });
    return r.data?.scanId;
  };
  v.enter = async (logoId) => v.call('POST', `${GAMES}/games/v1/entries`, { scanId: await v.scan(logoId) });
  return v;
}

export async function adminAs(username = 'super.admin', password = ADMIN_PASSWORD) {
  const a = client({ 'x-lkdr-admin': '1' });
  a.loginResult = await a.call('POST', `${PLATFORM}/admin/v1/auth/login`, { username, password });
  return a;
}

export const results = [];
export function check(id, label, ok, detail = '') {
  results.push({ id, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${ok ? '' : `  >> ${detail}`}`);
}
export const expectStatus = (id, label, r, status, code) =>
  check(id, label, r.status === status && (!code || r.code === code), `got ${r.status} ${r.code ?? ''} ${r.message ?? (typeof r.data === 'string' ? r.data.slice(0, 120) : '')}`);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  for (const f of failed) console.log(`  FAIL ${f.id} ${f.label}: ${f.detail}`);
  process.exitCode = failed.length ? 1 : 0;
}
