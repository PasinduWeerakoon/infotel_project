/**
 * Local QuickLook mock on http://localhost:4010. AWS uses lambda.ts with the same handler.
 */
import { createServer } from 'node:http';
import { handle } from './app.js';

const PORT = Number(process.env.PORT ?? 4010);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers))
    headers[key] = Array.isArray(value) ? value.join(',') : value;

  const response = await handle({
    method: req.method ?? 'GET',
    path: url.pathname,
    query: url.searchParams,
    headers,
    body: Buffer.concat(chunks).toString('utf8'),
    origin: `http://localhost:${PORT}`,
  });
  res.writeHead(response.status, {
    ...response.headers,
    ...(response.cookies.length ? { 'set-cookie': response.cookies } : {}),
  });
  res.end(response.body);
}).listen(PORT, () => console.log(`QuickLook mock running on http://localhost:${PORT} (open /demo or /)`));
