/**
 * Local HTTP server that runs a router exactly like API Gateway would.
 * Only for development. NOTE: copied into each backend service.
 */
import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { type ApiRequest, type RouteHandler, parseCookies } from '../lib/http.js';

/** Return true from `before` when the request was handled (for local-only endpoints). */
type Before = (req: IncomingMessage, res: ServerResponse, body: Buffer) => Promise<boolean>;

export function startLocalServer(router: RouteHandler, port: number, before?: Before): Server {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    if (before && (await before(req, res, body))) return;

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers))
      headers[key] = Array.isArray(value) ? value.join(',') : value;
    const rawBody = body.toString('utf8');

    const apiRequest: ApiRequest = {
      method: req.method ?? 'GET',
      path: url.pathname,
      params: {},
      query: Object.fromEntries(url.searchParams),
      headers,
      cookies: parseCookies(headers.cookie),
      body: parseJson(rawBody),
      rawBody,
      requestId: randomUUID(),
      ip: req.socket.remoteAddress ?? '',
    };

    const response = await router(apiRequest);
    const isText = response.text !== undefined;
    res.writeHead(response.status, {
      'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json',
      'cache-control': 'no-store',
      ...response.headers,
      ...(response.cookies?.length ? { 'set-cookie': response.cookies } : {}),
    });
    res.end(isText ? response.text : response.body === undefined ? '' : JSON.stringify(response.body));
  });
  server.listen(port);
  return server;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
