/**
 * Runtime configuration for the Games Event API.
 * Secrets (cookie signing keys shared with the platform) come from SSM in AWS and are cached.
 */
import { getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { z } from 'zod';

const envSchema = z.object({
  STAGE: z.enum(['local', 'dev', 'prod']).default('local'),
  TABLE_NAME: z.string().default('lkdr-games-event'),
  /** The shared platform table, where QuickLook scans are stored */
  PLATFORM_TABLE_NAME: z.string().default('lkdr-platform'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  ASSETS_BASE_URL: z.string(),
  /** Stall screen messages: API Gateway WebSocket in AWS, the local ws server locally */
  SCREENS_MODE: z.enum(['apigateway', 'local']).default('apigateway'),
  WS_CALLBACK_URL: z.string().optional(),
  SECRETS_SOURCE: z.enum(['env', 'ssm']).default('env'),
  SSM_PREFIX: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ADMIN_SECRET: z.string().optional(),
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

export const imageUrl = (key: string | null): string | null => (key ? `${env.ASSETS_BASE_URL}/${key}` : null);
