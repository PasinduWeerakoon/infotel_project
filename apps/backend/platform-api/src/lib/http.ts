/**
 * Small HTTP layer shared by every route in this service.
 *
 * Routes work with a plain `ApiRequest` and return an `ApiResponse`, so the same code runs
 * behind API Gateway (see lambda-adapter.ts) and in the local dev server (see local/server.ts).
 *
 * NOTE: this file is copied as-is into each backend service so the services stay independent.
 */
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { logger } from './logger.js';

export interface ApiRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  cookies: Record<string, string>;
  /** Parsed JSON body, or undefined */
  body: unknown;
  /** The exact body as received (needed for webhook signatures) */
  rawBody: string;
  requestId: string;
  /** The caller's IP address (API Gateway source IP), for rate limits */
  ip: string;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  cookies?: string[];
  /** Serialised as JSON unless `text` is set */
  body?: unknown;
  text?: string;
}

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>;

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path with `:name` parameters, for example `/games/v1/entries/:entryId/play` */
  path: string;
  handler: RouteHandler;
}

/** An error that becomes `{ error: { code, message, details } }` with the given HTTP status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200, extra: Partial<ApiResponse> = {}): ApiResponse => ({
  status,
  body,
  ...extra,
});

export const noContent = (extra: Partial<ApiResponse> = {}): ApiResponse => ({ status: 204, ...extra });

export const redirect = (location: string, cookies: string[] = []): ApiResponse => ({
  status: 302,
  headers: { location, 'cache-control': 'no-store' },
  cookies,
});

/** Validates the JSON body with a Zod schema. Invalid input becomes a 400 VALIDATION_FAILED. */
export function parseBody<S extends ZodTypeAny>(schema: S, req: ApiRequest): z.output<S> {
  return schema.parse(req.body ?? {});
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: ApiRequest): z.output<S> {
  return schema.parse(req.query);
}

interface CompiledRoute extends Route {
  regex: RegExp;
  keys: string[];
}

function compile(route: Route): CompiledRoute {
  const keys: string[] = [];
  const pattern = route.path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { ...route, regex: new RegExp(`^${pattern}/?$`), keys };
}

/** Builds one handler from a list of routes. Unknown paths return 404, errors return the standard shape. */
export function createRouter(routes: Route[]): RouteHandler {
  const compiled = routes.map(compile);

  return async (req) => {
    try {
      for (const route of compiled) {
        if (route.method !== req.method) continue;
        const match = route.regex.exec(req.path);
        if (!match) continue;
        route.keys.forEach((key, i) => {
          req.params[key] = decodeURIComponent(match[i + 1] ?? '');
        });
        return await route.handler(req);
      }
      throw new HttpError(404, 'NOT_FOUND', 'Route not found');
    } catch (error) {
      return toErrorResponse(error, req);
    }
  };
}

export function toErrorResponse(error: unknown, req: ApiRequest): ApiResponse {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    );
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return json(
      { error: { code: 'VALIDATION_FAILED', message: 'Some fields are not valid', details: { issues } } },
      400,
    );
  }
  logger.error('Unhandled error', { error, path: req.path, requestId: req.requestId });
  return json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, 500);
}

interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
  sameSite: 'Lax' | 'Strict';
  path?: string;
}

/** Serialises an HttpOnly cookie. A max age of 0 clears the cookie. */
export function cookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${options.maxAgeSeconds}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookies(header: string | undefined | string[]): Record<string, string> {
  const list = Array.isArray(header) ? header : (header ?? '').split(';');
  const result: Record<string, string> = {};
  for (const part of list) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
