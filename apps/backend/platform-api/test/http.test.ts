import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type ApiRequest, HttpError, createRouter, json, parseBody } from '../src/lib/http.js';

const request = (method: string, path: string, body?: unknown): ApiRequest => ({
  method,
  path,
  params: {},
  query: {},
  headers: {},
  cookies: {},
  body,
  rawBody: body ? JSON.stringify(body) : '',
  requestId: 'test',
});

const router = createRouter([
  { method: 'GET', path: '/items/:itemId', handler: async (req) => json({ id: req.params.itemId }) },
  {
    method: 'POST',
    path: '/items',
    handler: async (req) => json(parseBody(z.object({ name: z.string().min(1) }), req), 201),
  },
  {
    method: 'GET',
    path: '/fail',
    handler: async () => {
      throw new HttpError(409, 'ALREADY_PLAYED_THIS_SESSION', 'Already played');
    },
  },
]);

describe('router', () => {
  it('matches path parameters', async () => {
    expect((await router(request('GET', '/items/abc'))).body).toEqual({ id: 'abc' });
  });

  it('returns 404 for unknown routes', async () => {
    expect((await router(request('GET', '/nope'))).status).toBe(404);
  });

  it('turns validation errors into 400 VALIDATION_FAILED', async () => {
    const response = await router(request('POST', '/items', { name: '' }));
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('turns HttpError into the standard error shape', async () => {
    const response = await router(request('GET', '/fail'));
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'ALREADY_PLAYED_THIS_SESSION', message: 'Already played', details: undefined },
    });
  });
});
