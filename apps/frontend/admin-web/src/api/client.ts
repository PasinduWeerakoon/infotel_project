/**
 * Admin API client. Every call sends the admin cookie (same origin) and the `X-LKDR-Admin`
 * header the APIs require against cross-site requests. An expired session sends the user to sign in.
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

export const SESSION_EXPIRED_EVENT = 'lkdr:session-expired';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'x-lkdr-admin': '1',
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection');
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
      .error;
    if (response.status === 401 && path !== '/admin/v1/auth/login')
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      error?.message ?? 'Something went wrong',
      error?.details,
    );
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Query string from an object, skipping empty values. */
export const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};
