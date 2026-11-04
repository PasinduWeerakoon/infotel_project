import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptPartnerLink } from '../src/services/partner-link.js';

// A test key only. The real QuickLook key is kept in SSM, never in the code.
const KEY = '53c8fc830852a660731bcc69ce8641be6da48dd75be61d201b1eb48edbed705e';
const NOW = Date.parse('2026-11-03T10:00:00Z');
const rules = { keyHex: KEY, maxAgeSeconds: 300, requireTime: false, logoId: 'logo_game_dip', now: NOW };

/** Makes a link the way QuickLook does: hex(iv 12 | AES-256-GCM ciphertext | tag 16) */
function link(payload: unknown, keyHex = KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}

const user = { user_id: 'edef31a4-8dfb-4e60-81ea-dc7168aead6a', first_name: 'Nimal', last_name: 'Perera' };
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (error) {
    return (error as { code?: string }).code ?? 'ERROR';
  }
};

describe('QuickLook partner link', () => {
  it('opens a link in the QuickLook format and joins the names', () => {
    expect(decryptPartnerLink(link(user), rules)).toEqual({ userId: user.user_id, fullName: 'Nimal Perera' });
  });

  it('refuses a changed link, the wrong key and text that is not hex', () => {
    const good = link(user);
    const changed = `${good.slice(0, 40)}${good[40] === 'a' ? 'b' : 'a'}${good.slice(41)}`;
    expect(code(() => decryptPartnerLink(changed, rules))).toBe('LINK_INVALID');
    expect(code(() => decryptPartnerLink(link(user, 'ab'.repeat(32)), rules))).toBe('LINK_INVALID');
    expect(code(() => decryptPartnerLink('not-hex-at-all', rules))).toBe('LINK_INVALID');
    expect(code(() => decryptPartnerLink(link({ first_name: 'No id' }), rules))).toBe('LINK_INVALID');
  });

  it('refuses a link older than the allowed age, in seconds, milliseconds or ISO', () => {
    const old = NOW / 1000 - 301;
    expect(code(() => decryptPartnerLink(link({ ...user, iat: old }), rules))).toBe('LINK_EXPIRED');
    expect(code(() => decryptPartnerLink(link({ ...user, iat: old * 1000 }), rules))).toBe('LINK_EXPIRED');
    expect(
      code(() => decryptPartnerLink(link({ ...user, issued_at: new Date(old * 1000).toISOString() }), rules)),
    ).toBe('LINK_EXPIRED');
    expect(code(() => decryptPartnerLink(link({ ...user, iat: NOW / 1000 - 60 }), rules))).toBe('OK');
  });

  it('refuses a link past its exp, or made in the future', () => {
    expect(code(() => decryptPartnerLink(link({ ...user, exp: NOW / 1000 - 1 }), rules))).toBe(
      'LINK_EXPIRED',
    );
    expect(code(() => decryptPartnerLink(link({ ...user, iat: NOW / 1000 + 600 }), rules))).toBe(
      'LINK_EXPIRED',
    );
  });

  it('accepts a link without a time unless a time is required', () => {
    expect(code(() => decryptPartnerLink(link(user), rules))).toBe('OK');
    expect(code(() => decryptPartnerLink(link(user), { ...rules, requireTime: true }))).toBe('LINK_EXPIRED');
  });

  it('refuses a link made for the other game', () => {
    expect(code(() => decryptPartnerLink(link({ ...user, logo_id: 'logo_game_spin' }), rules))).toBe(
      'LINK_INVALID',
    );
    expect(code(() => decryptPartnerLink(link({ ...user, logo_id: 'logo_game_dip' }), rules))).toBe('OK');
  });
});
