/**
 * Stand-in for QuickLook's Leaderboard API (LEADERBOARD_API.md), so the Treasure Hunt can be built
 * and tested before the real base URL, keys and event logos arrive.
 *
 *   GET /leaderboard/logos          X-API-Key   search the logos
 *   GET /leaderboard/scans                      open ranking (masked contact details)
 *   GET /leaderboard/scans/export   X-API-Key   the same ranking with full contact details (JSON)
 *
 * Test helpers (mock only):
 *   POST /_mock/leaderboard/scans   { userId, fullName?, mobile?, logoId, at? }  add one scan
 *   POST /_mock/leaderboard/crowd   { players?, minutes? }  fake players scanning in the last minutes
 *   POST /_mock/leaderboard/reset   forget every scan
 *
 * Scans are kept in memory, so they are lost when the mock restarts. That is fine for testing.
 */

export interface MockLogo {
  logo_id: string;
  product_name: string;
  company_name: string | null;
  logo_code: string | null;
  logo_url: string | null;
  is_active: boolean;
}

/** Eight stall brands for the hunt, and four unrelated logos to test the selection */
export const MOCK_LOGOS: MockLogo[] = [
  ['0b6f2a10-1c1e-4a61-9a01-000000000001', 'Lanka Fibre Broadband', 'Lanka Fibre', 'QL-0101'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000002', 'CeyCloud Hosting', 'CeyCloud', 'QL-0102'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000003', 'Serendib Payments', 'Serendib Pay', 'QL-0103'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000004', 'Kandy Code Academy', null, 'QL-0104'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000005', 'Ruhuna Robotics', 'Ruhuna Robotics', 'QL-0105'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000006', 'Lotus Mobile', 'Lotus Telecom', 'QL-0106'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000007', 'Galle Data Labs', 'Galle Data', 'QL-0107'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000008', 'Island Domains', 'LK Domain Registry', 'QL-0108'],
  ['0b6f2a10-1c1e-4a61-9a01-000000000009', 'Spicy Bites Snacks', 'Spicy Bites', 'QL-0201'],
  ['0b6f2a10-1c1e-4a61-9a01-00000000000a', 'Blue Ocean Tea', 'Blue Ocean', 'QL-0202'],
  ['0b6f2a10-1c1e-4a61-9a01-00000000000b', 'Coconut Grove Hotel', 'Coconut Grove', null],
  ['0b6f2a10-1c1e-4a61-9a01-00000000000c', 'Old Logo (switched off)', 'Archive', 'QL-0999'],
].map(([logo_id, product_name, company_name, logo_code], i) => ({
  logo_id: logo_id as string,
  product_name: product_name as string,
  company_name: company_name ?? null,
  logo_code: logo_code ?? null,
  logo_url: null,
  is_active: i !== 11,
}));

interface Scan {
  userId: string;
  fullName: string;
  mobile: string;
  logoId: string;
  at: number;
}

const scans: Scan[] = [];

export interface LeaderboardRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: string;
}

type Reply = { status: number; body: unknown };

const apiKey = () => process.env.LEADERBOARD_API_KEY ?? 'local-leaderboard-key';

/** Colombo time with microseconds, as the real API answers */
function colombo(ms: number): string {
  const shifted = new Date(ms + 330 * 60_000).toISOString(); // +05:30
  return `${shifted.slice(0, 23)}000+05:30`;
}

/** ISO 8601 with a time. No offset means Colombo time. A bare date is refused */
function parseTime(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = Date.parse(hasOffset ? value : `${value}+05:30`);
  return Number.isNaN(ms) ? null : ms;
}

const unprocessable = (detail: string): Reply => ({ status: 422, body: { detail } });

function mask(mobile: string): string {
  if (mobile.length < 10) return '*'.repeat(mobile.length);
  return `${mobile.slice(0, 3)}${'*'.repeat(mobile.length - 6)}${mobile.slice(-3)}`;
}

function ranking(query: URLSearchParams, maxLimit: number, full: boolean): Reply {
  const start = parseTime(query.get('start'));
  const end = parseTime(query.get('end'));
  if (start === null || end === null) return unprocessable('start and end must be ISO 8601 with a time');
  if (start >= end) return unprocessable('end must be after start');
  if (end - start > 31 * 86_400_000) return unprocessable('the period is longer than 31 days');
  const ids = [
    ...new Set(
      query
        .getAll('logo_ids')
        .flatMap((v) => v.split(','))
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || ids.length > 100) return unprocessable('logo_ids: 1 to 100 values');
  const known = ids.filter((id) => MOCK_LOGOS.some((l) => l.logo_id === id));
  if (known.length === 0) return unprocessable('none of the logo_ids are known');
  const limit = Number(query.get('limit') ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) return unprocessable('limit out of range');
  const includeLogos = full || query.get('include_logos') !== 'false';

  const people = new Map<string, { scan: Scan; total: number; first: number; logos: Map<string, Scan[]> }>();
  for (const scan of scans) {
    if (scan.at < start || scan.at > end || !known.includes(scan.logoId)) continue;
    const person = people.get(scan.userId) ?? { scan, total: 0, first: scan.at, logos: new Map() };
    person.total++;
    person.first = Math.min(person.first, scan.at);
    person.logos.set(scan.logoId, [...(person.logos.get(scan.logoId) ?? []), scan]);
    people.set(scan.userId, person);
  }
  const rows = [...people.values()]
    .map((p) => {
      const firsts = [...p.logos.values()].map((list) => Math.min(...list.map((s) => s.at)));
      return { ...p, distinct: p.logos.size, completed: Math.max(...firsts) };
    })
    .sort((a, b) => b.distinct - a.distinct || a.completed - b.completed);

  return {
    status: 200,
    body: {
      period: {
        start: colombo(start),
        end: colombo(end),
        start_utc: new Date(start).toISOString(),
        end_utc: new Date(end).toISOString(),
        timezone: 'Asia/Colombo',
      },
      generated_at: colombo(Date.now()),
      total_event_logos: known.length,
      unknown_logo_ids: ids.filter((id) => !known.includes(id)),
      total_participants: rows.length,
      leaderboard: rows.slice(0, limit).map((row, index) => {
        const [first = '', ...rest] = row.scan.fullName.split(' ');
        return {
          rank: index + 1,
          user: full
            ? {
                user_id: row.scan.userId,
                full_name: row.scan.fullName,
                first_name: first,
                last_name: rest.join(' '),
                mobile_number: row.scan.mobile,
                email: `${first.toLowerCase()}@example.com`,
              }
            : {
                user_id: row.scan.userId,
                full_name: row.scan.fullName,
                mobile_masked: mask(row.scan.mobile),
                email_masked: `${first.slice(0, 2).toLowerCase()}***@example.com`,
              },
          distinct_logos_scanned: row.distinct,
          total_scans: row.total,
          first_scan_at: colombo(row.first),
          completed_at: colombo(row.completed),
          logos: includeLogos
            ? [...row.logos.entries()].map(([logoId, list]) => {
                const logo = MOCK_LOGOS.find((l) => l.logo_id === logoId);
                return {
                  logo_id: logoId,
                  logo_code: logo?.logo_code ?? null,
                  product_name: logo?.product_name ?? '',
                  company_name: logo?.company_name ?? null,
                  logo_url: logo?.logo_url ?? null,
                  first_scanned_at: colombo(Math.min(...list.map((s) => s.at))),
                  scan_count: list.length,
                };
              })
            : null,
        };
      }),
    },
  };
}

function searchLogos(query: URLSearchParams): Reply {
  const has = (value: string | null, filter: string | null) =>
    !filter || (value ?? '').toLowerCase().includes(filter.toLowerCase());
  const page = Number(query.get('page') ?? 1);
  const pageSize = Number(query.get('page_size') ?? 20);
  if (!(page >= 1) || !(pageSize >= 1 && pageSize <= 100))
    return unprocessable('page or page_size out of range');
  const items = MOCK_LOGOS.filter(
    (l) =>
      (query.get('include_inactive') === 'true' || l.is_active) &&
      has(l.product_name, query.get('name')) &&
      (!query.get('company') || (l.company_name !== null && has(l.company_name, query.get('company')))) &&
      has(l.logo_code, query.get('logo_code')),
  ).sort((a, b) => a.product_name.localeCompare(b.product_name) || a.logo_id.localeCompare(b.logo_id));
  return {
    status: 200,
    body: {
      page,
      page_size: pageSize,
      total: items.length,
      total_pages: Math.max(1, Math.ceil(items.length / pageSize)),
      items: items.slice((page - 1) * pageSize, page * pageSize),
    },
  };
}

/** Adds one scan (test helper and the simulator page) */
export function addScan(input: {
  userId: string;
  fullName?: string;
  mobile?: string;
  logoId: string;
  at?: number;
}) {
  scans.push({
    userId: input.userId,
    fullName: input.fullName ?? `Test ${input.userId.slice(-6)}`,
    mobile: input.mobile ?? '0770000000',
    logoId: input.logoId,
    at: input.at ?? Date.now(),
  });
}

const CROWD_NAMES = ['Amal Perera', 'Sachini Fernando', 'Ravindu Silva', 'Hasini Jayasuriya', 'Kavindu Dias'];

/** Fake players scanning random event logos over the last few minutes */
function addCrowd(players: number, minutes: number) {
  const event = MOCK_LOGOS.slice(0, 8);
  for (let p = 0; p < players; p++) {
    const userId = `ql_crowd_${String(p + 1).padStart(3, '0')}`;
    const name = `${CROWD_NAMES[p % CROWD_NAMES.length]} ${p + 1}`;
    const count = 1 + Math.floor(Math.random() * event.length);
    for (const logo of [...event].sort(() => Math.random() - 0.5).slice(0, count)) {
      const at = Date.now() - Math.floor(Math.random() * minutes * 60_000);
      addScan({
        userId,
        fullName: name,
        mobile: `07${String(10_000_000 + p * 7919).slice(0, 8)}`,
        logoId: logo.logo_id,
        at,
      });
    }
  }
}

/** Answers leaderboard paths, or returns undefined for other paths */
export function handleLeaderboard(req: LeaderboardRequest): Reply | undefined {
  const keyOk = req.headers['x-api-key'] === apiKey();
  const route = `${req.method} ${req.path}`;
  switch (route) {
    case 'GET /leaderboard/scans':
      return ranking(req.query, 100, false);
    case 'GET /leaderboard/scans/export':
      if (!keyOk) return { status: 401, body: { detail: 'Missing or wrong X-API-Key' } };
      return ranking(req.query, 1000, true);
    case 'GET /leaderboard/logos':
      if (!keyOk) return { status: 401, body: { detail: 'Missing or wrong X-API-Key' } };
      return searchLogos(req.query);
    case 'POST /_mock/leaderboard/scans': {
      const body = JSON.parse(req.body || '{}') as Parameters<typeof addScan>[0];
      if (!body.userId || !body.logoId) return unprocessable('userId and logoId are needed');
      addScan(body);
      return { status: 201, body: { scans: scans.length } };
    }
    case 'POST /_mock/leaderboard/crowd': {
      const body = JSON.parse(req.body || '{}') as { players?: number; minutes?: number };
      addCrowd(body.players ?? 20, body.minutes ?? 30);
      return { status: 201, body: { scans: scans.length } };
    }
    case 'POST /_mock/leaderboard/reset':
      scans.length = 0;
      return { status: 200, body: { scans: 0 } };
    default:
      return undefined;
  }
}
