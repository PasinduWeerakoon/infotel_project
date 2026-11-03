/**
 * The mock's ID token signing key.
 * - In AWS: from MOCK_SIGNING_JWK (a private JWK, created once by the deploy script), so every
 *   Lambda instance signs with the same key that the platform API has cached.
 * - Locally: kept in .local/signing-key.json so restarts do not change it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type JWK, exportJWK, generateKeyPair, importJWK } from 'jose';

const KID = 'mock-key-1';

export async function loadSigningKey() {
  const fromEnv = process.env.MOCK_SIGNING_JWK;
  if (fromEnv) {
    const privateJwk = JSON.parse(fromEnv) as JWK;
    const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...publicJwk } = privateJwk;
    return { privateKey: await importJWK(privateJwk, 'RS256'), publicJwk: withMeta(publicJwk) };
  }

  const file = join(process.cwd(), '.local', 'signing-key.json');
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as { privateJwk: JWK; publicJwk: JWK };
    return { privateKey: await importJWK(saved.privateJwk, 'RS256'), publicJwk: withMeta(saved.publicJwk) };
  } catch {
    const pair = await generateKeyPair('RS256', { extractable: true });
    const privateJwk = await exportJWK(pair.privateKey);
    const publicJwk = await exportJWK(pair.publicKey);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ privateJwk, publicJwk }));
    return { privateKey: pair.privateKey, publicJwk: withMeta(publicJwk) };
  }
}

const withMeta = (jwk: JWK) => ({ ...jwk, kid: KID, alg: 'RS256', use: 'sig' });
