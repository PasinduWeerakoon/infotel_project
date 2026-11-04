/**
 * A scan QuickLook's backend sends us: `{"data":"<hex>"}` (decision D-20).
 *
 *   hex( iv 12 bytes | AES-256-GCM ciphertext | auth tag 16 bytes )
 *   plaintext: {"logo_id":"…","user_id":"…","user_name":"…","scanned_at"?:"…","event_id"?:"…"}
 *
 * The same format as the game links (platform API, services/partner-link.ts), with its own key per
 * environment. The auth tag proves QuickLook sent it. `scanned_at` (seconds, milliseconds or ISO)
 * older than the allowed age is refused, so a copied request cannot be replayed into a later
 * session. Without it the time we received the scan is used.
 */
import { createDecipheriv } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../lib/http.js';

export interface ScanMessage {
  logoId: string;
  userId: string;
  userName: string;
  eventId: string | null;
  scannedAt: Date | null;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

const payloadSchema = z.object({
  logo_id: z.string().trim().min(1).max(100),
  user_id: z.string().trim().min(1).max(100),
  user_name: z.string().trim().max(120).optional().default(''),
  event_id: z.string().trim().min(1).max(100).optional(),
  scanned_at: z.union([z.string(), z.number()]).optional(),
});

const invalid = () => new HttpError(400, 'MESSAGE_INVALID', 'The scan message could not be opened');
const expired = () => new HttpError(400, 'MESSAGE_EXPIRED', 'The scan message is too old');

/** A time from seconds, milliseconds or an ISO date, or null */
function toDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return new Date(value > 1e12 ? value : value * 1000);
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value)) return toDate(Number(value));
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  return null;
}

export function openScanMessage(
  hex: string,
  rules: { keyHex: string; maxAgeSeconds: number; now?: number },
): ScanMessage {
  const key = Buffer.from(rules.keyHex, 'hex');
  if (key.length !== 32) throw new Error('Hunt scan key must be 32 bytes in hex');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw invalid();
  const data = Buffer.from(hex, 'hex');
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
    throw invalid(); // wrong key, changed message or not JSON
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw invalid();
  const payload = parsed.data;

  const scannedAt = payload.scanned_at === undefined ? null : toDate(payload.scanned_at);
  if (payload.scanned_at !== undefined && !scannedAt) throw invalid();
  if (scannedAt) {
    const ageSeconds = ((rules.now ?? Date.now()) - scannedAt.getTime()) / 1000;
    // A minute of clock difference between QuickLook and us is allowed
    if (ageSeconds > rules.maxAgeSeconds || ageSeconds < -60) throw expired();
  }
  return {
    logoId: payload.logo_id,
    userId: payload.user_id,
    userName: payload.user_name.replace(/\s+/g, ' ').slice(0, 60),
    eventId: payload.event_id ?? null,
    scannedAt,
  };
}
