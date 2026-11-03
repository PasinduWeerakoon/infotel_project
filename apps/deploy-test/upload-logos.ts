/**
 * Gives every seeded logo its default artwork (default-logos/{logoId}.svg), using the same admin
 * API as Admin > Logos and screens: sign in, ask for an upload URL, PUT the file to S3, then save
 * the logo with its new image key. Logos that already have an image are left alone, so artwork
 * changed in the admin panel is never overwritten. FORCE=1 replaces them all.
 *
 *   npx tsx upload-logos.ts
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const readEnv = async (file: string) =>
  Object.fromEntries(
    (await readFile(join(here, process.env.STATE_DIR ?? '.state', file), 'utf8'))
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

const urls = await readEnv('urls.env');
const secrets = await readEnv('secrets.env');
// The admin site forwards /admin/* and /platform/* to the API on its own address (same origin cookie)
const base = urls.ADMIN_URL;

interface Logo {
  logoId: string;
  name: string;
  logoType: string;
  targetId: string | null;
  imageKey?: string | null;
  imageUrl: string | null;
}

let cookie = '';
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-lkdr-admin': '1', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0] ?? '';
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

await api('POST', '/admin/v1/auth/login', { username: 'super.admin', password: secrets.ADMIN_PASSWORD });
const { items } = await api<{ items: Logo[] }>('GET', '/admin/v1/logos');
const files = new Set(await readdir(join(here, 'default-logos')));

for (const logo of items) {
  const file = `${logo.logoId}.svg`;
  if (!files.has(file)) continue;
  if (logo.imageUrl && process.env.FORCE !== '1') {
    console.log(`kept     ${logo.logoId} (already has an image)`);
    continue;
  }
  const svg = await readFile(join(here, 'default-logos', file));
  const upload = await api<{ key: string; uploadUrl: string }>('POST', '/admin/v1/uploads', {
    purpose: 'logo',
    contentType: 'image/svg+xml',
    size: svg.length,
  });
  const put = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/svg+xml' },
    body: svg,
  });
  if (!put.ok) throw new Error(`S3 upload for ${logo.logoId} failed: ${put.status}`);
  await api('PUT', `/admin/v1/logos/${logo.logoId}`, {
    name: logo.name,
    logoType: logo.logoType,
    targetId: logo.targetId,
    imageKey: upload.key,
  });
  console.log(`uploaded ${logo.logoId}`);
}
