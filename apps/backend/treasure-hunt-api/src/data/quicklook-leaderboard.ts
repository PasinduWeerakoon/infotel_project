/**
 * QuickLook Leaderboard API client (LEADERBOARD_API.md). Called from our backend only: the key
 * unlocks full names and mobile numbers, so it never reaches a browser.
 *
 *   GET /leaderboard/scans/export   the ranking of a period with full contact details
 *   GET /leaderboard/logos          search the registered logos
 */
import { getLeaderboardConfig } from '../config.js';
import type { EventLogo } from '../domain/types.js';
import { HttpError } from '../lib/http.js';

const TIMEOUT_MS = 8000;
/** The most rows the export returns */
export const EXPORT_MAX_ROWS = 1000;

export interface StandingRow {
  rank: number;
  userId: string;
  fullName: string;
  mobile: string;
  stalls: number;
  totalScans: number;
  reachedAt: string;
  logos: { logoId: string; firstScannedAt: string }[];
}

export interface Standings {
  participants: number;
  unknownLogoIds: string[];
  rows: StandingRow[];
}

interface ExportBody {
  total_participants: number;
  unknown_logo_ids: string[];
  leaderboard: {
    rank: number;
    user: { user_id: string; full_name: string; mobile_number: string | null };
    distinct_logos_scanned: number;
    total_scans: number;
    completed_at: string;
    logos: { logo_id: string; first_scanned_at: string }[] | null;
  }[];
}

interface LogoBody {
  page: number;
  total: number;
  total_pages: number;
  items: {
    logo_id: string;
    product_name: string;
    company_name: string | null;
    logo_code: string | null;
    logo_url: string | null;
  }[];
}

export const NOT_CONNECTED = new HttpError(
  503,
  'LEADERBOARD_NOT_CONNECTED',
  'The QuickLook leaderboard is not connected for this environment yet',
);

async function call<T>(path: string, params: URLSearchParams): Promise<T> {
  const config = await getLeaderboardConfig();
  if (!config) throw NOT_CONNECTED;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}?${params}`, {
      headers: { 'x-api-key': config.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'LEADERBOARD_UNAVAILABLE', 'QuickLook did not answer. Please try again shortly');
  }
  if (response.ok) return (await response.json()) as T;
  const detail = await response.text().catch(() => '');
  if (response.status === 401) {
    throw new HttpError(502, 'LEADERBOARD_KEY_REJECTED', 'QuickLook refused our leaderboard key');
  }
  if (response.status === 422) {
    throw new HttpError(
      422,
      'LEADERBOARD_REQUEST_INVALID',
      `QuickLook refused the request: ${detail.slice(0, 200)}`,
    );
  }
  throw new HttpError(502, 'LEADERBOARD_UNAVAILABLE', `QuickLook answered ${response.status}`);
}

/** The ranking of one period for the selected logos, with full contact details */
export async function exportStandings(input: {
  start: string;
  end: string;
  logoIds: string[];
}): Promise<Standings> {
  const params = new URLSearchParams({
    start: input.start,
    end: input.end,
    logo_ids: input.logoIds.join(','),
    limit: String(EXPORT_MAX_ROWS),
    format: 'json',
  });
  const body = await call<ExportBody>('/leaderboard/scans/export', params);
  return {
    participants: body.total_participants,
    unknownLogoIds: body.unknown_logo_ids ?? [],
    rows: body.leaderboard.map((row) => ({
      rank: row.rank,
      userId: row.user.user_id,
      fullName: row.user.full_name,
      mobile: row.user.mobile_number ?? '',
      stalls: row.distinct_logos_scanned,
      totalScans: row.total_scans,
      reachedAt: row.completed_at,
      logos: (row.logos ?? []).map((l) => ({ logoId: l.logo_id, firstScannedAt: l.first_scanned_at })),
    })),
  };
}

/** One page of QuickLook logos for the admin to pick the event's logos from */
export async function searchLogos(input: {
  name?: string;
  company?: string;
  logoCode?: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({ page: String(input.page), page_size: String(input.pageSize) });
  if (input.name) params.set('name', input.name);
  if (input.company) params.set('company', input.company);
  if (input.logoCode) params.set('logo_code', input.logoCode);
  const body = await call<LogoBody>('/leaderboard/logos', params);
  return {
    page: body.page,
    total: body.total,
    totalPages: body.total_pages,
    items: body.items.map(
      (l): EventLogo => ({
        logoId: l.logo_id,
        productName: l.product_name,
        companyName: l.company_name,
        logoCode: l.logo_code,
        logoUrl: l.logo_url,
      }),
    ),
  };
}
