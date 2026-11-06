/**
 * Runtime configuration for the Treasure Hunt API.
 * Secrets (cookie signing keys shared with the platform), the key that opens QuickLook's scan
 * messages, and the QuickLook API address and key (event logo list) come from SSM in AWS and are
 * cached. Locally they come from the environment.
 */
import { getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { z } from 'zod';

const envSchema = z.object({
  STAGE: z.enum(['local', 'dev', 'prod']).default('local'),
  TABLE_NAME: z.string().default('lkdr-treasure-hunt'),
  /** The shared platform table, where admin accounts are stored */
  PLATFORM_TABLE_NAME: z.string().default('lkdr-platform'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  SECRETS_SOURCE: z.enum(['env', 'ssm']).default('env'),
  SSM_PREFIX: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ADMIN_SECRET: z.string().optional(),
  /** Local only: opens QuickLook's scan messages. In AWS: SSM {prefix}/hunt/scan-key */
  HUNT_SCAN_KEY: z.string().optional(),
  /** A scan message with a scan time older than this is refused */
  SCAN_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  /** Winners are worked out this long after a session ends, so scans still on their way land first */
  FINALIZE_GRACE_SECONDS: z.coerce.number().int().min(0).default(30),
  /** Local only: how often ended sessions are finalized (AWS runs the job every minute) */
  JOB_SECONDS: z.coerce.number().int().min(1).default(60),
});

export const env = envSchema.parse(process.env);

export interface Secrets {
  sessionSecret: string;
  adminSecret: string;
}

let cached: { secrets: Secrets; at: number } | undefined;

/** Cookie signing secrets, fetched at most every 5 minutes per Lambda instance. */
export async function getSecrets(): Promise<Secrets> {
  if (cached && Date.now() - cached.at < 300_000) return cached.secrets;
  let secrets: Secrets;
  if (env.SECRETS_SOURCE === 'ssm') {
    const session = `${env.SSM_PREFIX}/platform/session-secret`;
    const admin = `${env.SSM_PREFIX}/platform/admin-secret`;
    const values = await getParametersByName<string>(
      { [session]: {}, [admin]: {} },
      { decrypt: true, maxAge: 300 },
    );
    secrets = { sessionSecret: String(values[session]), adminSecret: String(values[admin]) };
  } else {
    if (!env.SESSION_SECRET || !env.ADMIN_SECRET) throw new Error('Missing SESSION_SECRET or ADMIN_SECRET');
    secrets = { sessionSecret: env.SESSION_SECRET, adminSecret: env.ADMIN_SECRET };
  }
  cached = { secrets, at: Date.now() };
  return secrets;
}

let scanKeyCached: { key: string | null; at: number } | undefined;

/** The key that opens QuickLook's scan messages, or null while it is not set (scans are refused). */
export async function getHuntScanKey(): Promise<string | null> {
  if (scanKeyCached && Date.now() - scanKeyCached.at < 300_000) return scanKeyCached.key;
  let key = env.HUNT_SCAN_KEY;
  if (env.SECRETS_SOURCE === 'ssm') {
    const name = `${env.SSM_PREFIX}/hunt/scan-key`;
    const values = await getParametersByName<string>(
      { [name]: {} },
      { decrypt: true, maxAge: 300, throwOnError: false },
    );
    key = values[name] ? String(values[name]) : undefined;
  }
  scanKeyCached = { key: key?.trim() || null, at: Date.now() };
  return scanKeyCached.key;
}
