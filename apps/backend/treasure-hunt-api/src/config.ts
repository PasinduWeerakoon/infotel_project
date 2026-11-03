/**
 * Runtime configuration for the Treasure Hunt API.
 * Secrets (cookie signing keys shared with the platform) and the QuickLook Leaderboard API
 * address and key come from SSM in AWS and are cached. Locally they come from the environment.
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
  /** Local only: the QuickLook mock answers the Leaderboard API */
  LEADERBOARD_BASE_URL: z.string().optional(),
  LEADERBOARD_API_KEY: z.string().optional(),
  /** How often open sessions are read from QuickLook (QuickLook asks for 15 seconds or more) */
  SYNC_SECONDS: z.coerce.number().int().min(5).default(15),
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

export interface LeaderboardConfig {
  baseUrl: string;
  apiKey: string;
}

let leaderboardCached: { config: LeaderboardConfig | null; at: number } | undefined;

/**
 * QuickLook Leaderboard API address and key for this environment, or null while they are not set
 * (the hunt then shows "not connected" instead of failing).
 * In AWS: `{SSM_PREFIX}/hunt/leaderboard-base-url` and `{SSM_PREFIX}/hunt/leaderboard-api-key`.
 */
export async function getLeaderboardConfig(): Promise<LeaderboardConfig | null> {
  if (leaderboardCached && Date.now() - leaderboardCached.at < 300_000) return leaderboardCached.config;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  if (env.SECRETS_SOURCE === 'ssm') {
    const url = `${env.SSM_PREFIX}/hunt/leaderboard-base-url`;
    const key = `${env.SSM_PREFIX}/hunt/leaderboard-api-key`;
    const values = await getParametersByName<string>(
      { [url]: {}, [key]: {} },
      { decrypt: true, maxAge: 300, throwOnError: false },
    );
    baseUrl = values[url] ? String(values[url]) : undefined;
    apiKey = values[key] ? String(values[key]) : undefined;
  } else {
    baseUrl = env.LEADERBOARD_BASE_URL;
    apiKey = env.LEADERBOARD_API_KEY;
  }
  const config = baseUrl && apiKey ? { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey } : null;
  leaderboardCached = { config, at: Date.now() };
  return config;
}
