import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openScanMessage } from '../src/domain/scan-message.js';

// A test key only. Each environment's real key is kept in SSM, never in the code.
const KEY = '9f1c2b7a4e6d8c0b3a5f7e9d1c3b5a7f9e1d3c5b7a9f1e3d5c7b9a1f3e5d7c9b';
const NOW = Date.parse('2026-11-03T10:00:00Z');
const rules = { keyHex: KEY, maxAgeSeconds: 300, now: NOW };

/** Encrypts a scan the way QuickLook's backend does: hex(iv 12 | AES-256-GCM ciphertext | tag 16) */
function message(payload: unknown, keyHex = KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}

const scan = {
  logo_id: 'logo-1',
  user_id: 'edef31a4-8dfb-4e60-81ea-dc7168aead6a',
  user_name: 'Nimal  Perera',
};
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (error) {
    return (error as { code?: string }).code ?? 'ERROR';
  }
};

describe('QuickLook scan message', () => {
  it('opens a scan and tidies the name', () => {
    expect(openScanMessage(message(scan), rules)).toEqual({
      logoId: 'logo-1',
      userId: scan.user_id,
      userName: 'Nimal Perera',
      eventId: null,
      scannedAt: null,
    });
  });

  it('reads the event ID and the scan time in seconds, milliseconds or ISO', () => {
    const seconds = NOW / 1000 - 30;
    for (const scannedAt of [seconds, seconds * 1000, new Date(seconds * 1000).toISOString()]) {
      const opened = openScanMessage(message({ ...scan, event_id: 'evt_1', scanned_at: scannedAt }), rules);
      expect(opened.eventId).toBe('evt_1');
      expect(opened.scannedAt?.getTime()).toBe(seconds * 1000);
    }
  });

  it('refuses a changed message, the wrong key and a message without the needed fields', () => {
    const good = message(scan);
    const changed = `${good.slice(0, 40)}${good[40] === 'a' ? 'b' : 'a'}${good.slice(41)}`;
    expect(code(() => openScanMessage(changed, rules))).toBe('MESSAGE_INVALID');
    expect(code(() => openScanMessage(message(scan, 'ab'.repeat(32)), rules))).toBe('MESSAGE_INVALID');
    expect(code(() => openScanMessage('zz-not-hex', rules))).toBe('MESSAGE_INVALID');
    expect(code(() => openScanMessage(message({ user_id: 'u1' }), rules))).toBe('MESSAGE_INVALID');
    expect(code(() => openScanMessage(message({ ...scan, scanned_at: 'yesterday' }), rules))).toBe(
      'MESSAGE_INVALID',
    );
  });

  it('refuses a scan older than 5 minutes or from the future, so a copied request cannot be replayed', () => {
    expect(code(() => openScanMessage(message({ ...scan, scanned_at: NOW / 1000 - 301 }), rules))).toBe(
      'MESSAGE_EXPIRED',
    );
    expect(code(() => openScanMessage(message({ ...scan, scanned_at: NOW / 1000 + 120 }), rules))).toBe(
      'MESSAGE_EXPIRED',
    );
    expect(code(() => openScanMessage(message({ ...scan, scanned_at: NOW / 1000 - 299 }), rules))).toBe('OK');
  });
});
