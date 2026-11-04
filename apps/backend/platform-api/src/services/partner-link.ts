/**
 * QuickLook partner link: the logo link carries the signed-in QuickLook user as `?qUser=<hex>`.
 *
 *   hex( iv 12 bytes | AES-256-GCM ciphertext | auth tag 16 bytes )
 *   plaintext: {"user_id":"…","first_name":"…","last_name":"…"} (+ optional time and logo, below)
 *
 * The auth tag proves QuickLook made the link, so nobody can make up a user. The key is backend
 * only (SSM in AWS, `.env` locally), never in a web app.
 *
 * Expiry: a link older than PARTNER_LINK_MAX_AGE_SECONDS is refused when it carries a time
 * (`exp`, or `iat` / `issued_at` / `timestamp`, in seconds, milliseconds or ISO). Links without
 * a time are accepted until QuickLook adds one, unless PARTNER_LINK_REQUIRE_TIME=true.
 * A `logo_id` in the link, when present, must match the scanned logo.
 */
import { createDecipheriv, createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../lib/http.js';

export interface PartnerUser {
  userId: string;
  fullName: string;
}

export interface PartnerLinkRules {
  keyHex: string;
  maxAgeSeconds: number;
  requireTime: boolean;
  logoId: string;
  now?: number;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

const payloadSchema = z
  .object({
    user_id: z.string().trim().min(1).max(100),
    first_name: z.string().trim().max(60).optional().default(''),
    last_name: z.string().trim().max(60).optional().default(''),
    logo_id: z.string().optional(),
  })
  .passthrough();

const invalid = () => new HttpError(401, 'LINK_INVALID', 'Please scan the logo again with the QuickLook app');
const expired = () => new HttpError(401, 'LINK_EXPIRED', 'This link has expired. Please scan the logo again');

/** A short fingerprint of a link for logs, never the link or the user */
export const linkFingerprint = (qUser: string) =>
  createHash('sha256').update(qUser).digest('hex').slice(0, 12);

/** Seconds since 1970 from seconds, milliseconds or an ISO date, or null */
function toSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value / 1000 : value;
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value)) return toSeconds(Number(value));
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms / 1000;
  }
  return null;
}

export function decryptPartnerLink(qUser: string, rules: PartnerLinkRules): PartnerUser {
  const key = Buffer.from(rules.keyHex, 'hex');
  if (key.length !== 32) throw new Error('Partner link key must be 32 bytes in hex');
  if (!/^[0-9a-f]+$/i.test(qUser) || qUser.length % 2 !== 0) throw invalid();
  const data = Buffer.from(qUser, 'hex');
  if (data.length <= IV_BYTES + TAG_BYTES) throw invalid();

  let raw: unknown;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(data.subarray(IV_BYTES, data.length - TAG_BYTES)),
      decipher.final(),
    ]);
    raw = JSON.parse(plain.toString('utf8'));
  } catch {
    throw invalid(); // wrong key, changed link or not JSON
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw invalid();
  const payload = parsed.data as z.infer<typeof payloadSchema> & Record<string, unknown>;

  const now = (rules.now ?? Date.now()) / 1000;
  const exp = toSeconds(payload.exp);
  const issued = toSeconds(payload.iat ?? payload.issued_at ?? payload.timestamp);
  if (exp === null && issued === null && rules.requireTime) throw expired();
  if (exp !== null && now > exp) throw expired();
  // A minute of clock difference between QuickLook and us is allowed
  if (issued !== null && (now - issued > rules.maxAgeSeconds || issued - now > 60)) throw expired();

  if (payload.logo_id && payload.logo_id !== rules.logoId) throw invalid();

  const fullName = `${payload.first_name} ${payload.last_name}`.replace(/\s+/g, ' ').trim().slice(0, 60);
  return { userId: payload.user_id, fullName };
}
