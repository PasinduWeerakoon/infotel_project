/**
 * QuickLook API client for the event logo list, called once from our backend (the key stays
 * there). QuickLook has not shared its logo list API yet, so this follows the logo search of their
 * Leaderboard API (`GET /leaderboard/logos`, paged), which the QuickLook mock answers locally.
 * Adjust the path and fields here when their logo list API arrives.
 */
import { getLeaderboardConfig } from '../config.js';
import type { EventLogo } from '../domain/types.js';
import { HttpError } from '../lib/http.js';

const TIMEOUT_MS = 8000;

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
  'QUICKLOOK_NOT_CONNECTED',
  'The QuickLook logo list is not connected for this environment yet',
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
    throw new HttpError(502, 'QUICKLOOK_UNAVAILABLE', 'QuickLook did not answer. Please try again shortly');
  }
  if (response.ok) return (await response.json()) as T;
  const detail = await response.text().catch(() => '');
  if (response.status === 401) {
    throw new HttpError(502, 'QUICKLOOK_KEY_REJECTED', 'QuickLook refused our key');
  }
  if (response.status === 422) {
    throw new HttpError(
      422,
      'QUICKLOOK_REQUEST_INVALID',
      `QuickLook refused the request: ${detail.slice(0, 200)}`,
    );
  }
  throw new HttpError(502, 'QUICKLOOK_UNAVAILABLE', `QuickLook answered ${response.status}`);
}

/** One page of QuickLook logos */
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
