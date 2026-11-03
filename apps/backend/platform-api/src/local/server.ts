/**
 * Local development server for the platform API on http://localhost:4000.
 * Also stands in for S3 and CloudFront for uploaded images (`/_local/assets/*`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { createRouter } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { adminAuthRoutes } from '../routes/admin-auth.js';
import { logoRoutes } from '../routes/logos.js';
import { scanIntakeRoutes } from '../routes/scan-intake.js';
import { scanLoginRoutes } from '../routes/scan-login.js';
import { visitorAuthRoutes } from '../routes/visitor-auth.js';
import { startLocalServer } from './http-server.js';

const PORT = Number(process.env.PORT ?? 4000);
const ASSETS_DIR = join(process.cwd(), '.local', 'assets');
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const router = createRouter([
  ...visitorAuthRoutes,
  ...scanLoginRoutes,
  ...scanIntakeRoutes,
  ...adminAuthRoutes,
  ...logoRoutes,
]);

startLocalServer(router, PORT, async (req, res, body) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (!path.startsWith('/_local/assets/')) return false;

  const file = normalize(join(ASSETS_DIR, path.replace('/_local/assets/', '')));
  if (!file.startsWith(ASSETS_DIR)) {
    res.writeHead(400).end();
    return true;
  }
  if (req.method === 'PUT') {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    res.writeHead(200, { 'access-control-allow-origin': '*' }).end();
    return true;
  }
  if (req.method === 'OPTIONS') {
    res
      .writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'PUT',
        'access-control-allow-headers': '*',
      })
      .end();
    return true;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=60',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
  return true;
});

logger.info(`Platform API running on http://localhost:${PORT}`);
