/**
 * Runtime configuration.
 *
 * Plain settings come from environment variables (set by CDK or `.env` locally).
 * Secrets come from SSM Parameter Store in AWS and are cached in memory, because
 * SSM allows only about 40 reads per second (see docs: 02-architecture/scalability.md).
 */
import { getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { z } from 'zod';

const envSchema = z.object({
  STAGE: z.enum(['local', 'dev', 'prod']).default('local'),
  TABLE_NAME: z.string().default('lkdr-platform'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),

  // QuickLook (OpenID Connect provider and scan event sender)
  QL_ISSUER: z.string().url(),
  QL_CLIENT_ID: z.string(),
  QL_API_BASE: z.string().url(),
  /**
   * How the temporary token from a QuickLook redirect is turned into a visitor:
   * mock = any token becomes a stored test user (testing without QuickLook),
   * quicklook = QuickLook's token exchange API (when they provide it)
   */
  QL_TOKEN_MODE: z.enum(['mock', 'quicklook']).default('mock'),

  // Where visitors return after sign in
  GAMES_WEB_URL: z.string().url(),
  HUNT_WEB_URL: z.string().url(),

  // Scan event routing: EventBridge in AWS, plain HTTP to the local Treasure Hunt API locally
  EVENTS_MODE: z.enum(['eventbridge', 'http']).default('eventbridge'),
  EVENT_BUS_NAME: z.string().default('lkdr-games'),

  // Uploaded images (logos, prizes)
  ASSETS_MODE: z.enum(['s3', 'local']).default('s3'),
  ASSETS_BUCKET: z.string().optional(),
  ASSETS_BASE_URL: z.string(),

  // Secrets: either directly in the environment (local) or SSM parameter names (AWS)
  SECRETS_SOURCE: z.enum(['env', 'ssm']).default('env'),
  SSM_PREFIX: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ADMIN_SECRET: z.string().optional(),
  QL_CLIENT_SECRET: z.string().optional(),
  QL_WEBHOOK_SECRETS: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),

  // QuickLook partner link (`?qUser=` on the logo link, see services/partner-link.ts)
  PARTNER_LINK_KEY: z.string().optional(),
  PARTNER_LINK_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  PARTNER_LINK_REQUIRE_TIME: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema>;

export interface Secrets {
  /** Signs the visitor cookie `lkdr_session` (shared with the Games and Treasure Hunt APIs) */
  sessionSecret: string;
  /** Signs the admin cookie `lkdr_admin` (shared with the Games and Treasure Hunt APIs) */
  adminSecret: string;
  qlClientSecret: string;
  /** Active webhook secrets. Two can be active while a secret is rotated */
  qlWebhookSecrets: string[];
}

export type Config = Env & { secrets: Secrets; cookieSecure: boolean };

export const env: Env = envSchema.parse(process.env);

let cached: { config: Config; loadedAt: number } | undefined;
const SECRET_TTL_MS = 5 * 60 * 1000;

/** Returns the configuration. Secrets are fetched at most once every 5 minutes per Lambda instance. */
export async function getConfig(): Promise<Config> {
  if (cached && Date.now() - cached.loadedAt < SECRET_TTL_MS) return cached.config;
  const secrets = env.SECRETS_SOURCE === 'ssm' ? await loadSecretsFromSsm() : loadSecretsFromEnv();
  const config = { ...env, secrets, cookieSecure: env.COOKIE_SECURE === 'true' };
  cached = { config, loadedAt: Date.now() };
  return config;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

function loadSecretsFromEnv(): Secrets {
  return {
    sessionSecret: required('SESSION_SECRET', env.SESSION_SECRET),
    adminSecret: required('ADMIN_SECRET', env.ADMIN_SECRET),
    qlClientSecret: required('QL_CLIENT_SECRET', env.QL_CLIENT_SECRET),
    qlWebhookSecrets: required('QL_WEBHOOK_SECRETS', env.QL_WEBHOOK_SECRETS).split(','),
  };
}

async function loadSecretsFromSsm(): Promise<Secrets> {
  const prefix = required('SSM_PREFIX', env.SSM_PREFIX);
  const names = {
    session: `${prefix}/platform/session-secret`,
    admin: `${prefix}/platform/admin-secret`,
    client: `${prefix}/quicklook/client-secret`,
    webhook: `${prefix}/quicklook/webhook-secrets`,
  };
  const values = await getParametersByName<string>(
    {
      [names.session]: {},
      [names.admin]: {},
      [names.client]: {},
      [names.webhook]: {},
    },
    { decrypt: true, maxAge: 300 },
  );
  return {
    sessionSecret: required(names.session, values[names.session]),
    adminSecret: required(names.admin, values[names.admin]),
    qlClientSecret: required(names.client, values[names.client]),
    qlWebhookSecrets: required(names.webhook, values[names.webhook]).split(','),
  };
}

let partnerKeyCached: { key: string | null; at: number } | undefined;

/**
 * The key that opens QuickLook partner links, or null while it is not set (links with `qUser`
 * are then refused). In AWS: `{SSM_PREFIX}/quicklook/partner-link-key`, cached 5 minutes.
 */
export async function getPartnerLinkKey(): Promise<string | null> {
  if (partnerKeyCached && Date.now() - partnerKeyCached.at < SECRET_TTL_MS) return partnerKeyCached.key;
  let key: string | undefined = env.PARTNER_LINK_KEY;
  if (env.SECRETS_SOURCE === 'ssm') {
    const name = `${required('SSM_PREFIX', env.SSM_PREFIX)}/quicklook/partner-link-key`;
    const values = await getParametersByName<string>(
      { [name]: {} },
      { decrypt: true, maxAge: 300, throwOnError: false },
    );
    key = values[name] ? String(values[name]) : undefined;
  }
  partnerKeyCached = { key: key?.trim() || null, at: Date.now() };
  return partnerKeyCached.key;
}
