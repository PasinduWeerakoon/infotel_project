import { describe, expect, it } from 'vitest';
import { computeSignature, verifySignature } from '../src/domain/signature.js';

// Worked example from docs: 06-quicklook-integration/sample-payloads/scan-event-signature.md
const SECRET = 'test_secret_do_not_use_in_production';
const TIMESTAMP = '1793594645';
const BODY =
  '{"eventId":"evt_01HF8Z3K2N","eventType":"logo.scanned","occurredAt":"2026-11-02T10:14:05+05:30","scan":{"scanId":"qls_01HF8Z3K2M","logoId":"logo_game_spin"},"user":{"sub":"ql_pw_8f3a2c91"}}';
const EXPECTED = 'v1=14fdee153b2959fdca140eb8e2c1bb3fae5e5025642da9fa3718c6259afdb33f';

describe('scan event signature', () => {
  it('matches the worked example in the integration contract', () => {
    expect(computeSignature(SECRET, TIMESTAMP, BODY)).toBe(EXPECTED);
  });

  it('accepts a valid signature inside the time window', () => {
    const result = verifySignature({
      secrets: [SECRET],
      timestamp: TIMESTAMP,
      signature: EXPECTED,
      rawBody: BODY,
      nowSeconds: Number(TIMESTAMP) + 60,
    });
    expect(result).toBe('valid');
  });

  it('accepts the second secret during rotation', () => {
    const result = verifySignature({
      secrets: ['old_secret', SECRET],
      timestamp: TIMESTAMP,
      signature: EXPECTED,
      rawBody: BODY,
      nowSeconds: Number(TIMESTAMP),
    });
    expect(result).toBe('valid');
  });

  it('rejects a changed body', () => {
    const result = verifySignature({
      secrets: [SECRET],
      timestamp: TIMESTAMP,
      signature: EXPECTED,
      rawBody: BODY.replace('ql_pw_8f3a2c91', 'ql_pw_attacker'),
      nowSeconds: Number(TIMESTAMP),
    });
    expect(result).toBe('bad-signature');
  });

  it('rejects timestamps older than 5 minutes', () => {
    const result = verifySignature({
      secrets: [SECRET],
      timestamp: TIMESTAMP,
      signature: EXPECTED,
      rawBody: BODY,
      nowSeconds: Number(TIMESTAMP) + 301,
    });
    expect(result).toBe('bad-timestamp');
  });
});
