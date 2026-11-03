/**
 * QuickLook scan event signature (see docs: 06-quicklook-integration/integration-contract.md).
 *
 *   signed_payload = X-QL-Timestamp + "." + raw_request_body
 *   signature      = hex(HMAC_SHA256(shared_secret, signed_payload))
 *   header value   = "v1=" + signature
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TIMESTAMP_WINDOW_SECONDS = 300;

export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export type SignatureCheck = 'valid' | 'bad-timestamp' | 'bad-signature';

/**
 * Checks the signature against every active secret (two can be active during rotation),
 * using a constant-time comparison, and rejects timestamps outside the 5 minute window.
 */
export function verifySignature(input: {
  secrets: string[];
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowSeconds?: number;
}): SignatureCheck {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_WINDOW_SECONDS) {
    return 'bad-timestamp';
  }
  if (!input.signature) return 'bad-signature';

  const received = Buffer.from(input.signature);
  for (const secret of input.secrets) {
    const expected = Buffer.from(computeSignature(secret, String(timestamp), input.rawBody));
    if (expected.length === received.length && timingSafeEqual(expected, received)) return 'valid';
  }
  return 'bad-signature';
}
