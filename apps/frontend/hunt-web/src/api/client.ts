/**
 * Small fetch wrapper. Every API error has the same shape: { error: { code, message, details } }.
 * The sign-in cookie is HttpOnly and same-origin, so no tokens are handled in the browser.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Any failure without a response (offline, venue Wi-Fi dropped) */
export const NETWORK_ERROR = 'NETWORK_ERROR';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR, 'You seem to be offline. Please check your connection');
  }

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
      .error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Something went wrong',
      error?.details,
    );
  }
  return body as T;
}

export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
