import { describe, expect, it } from 'vitest';
import { hashPassword, isStrongPassword, verifyPassword } from '../src/domain/password.js';

describe('admin passwords', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Correct2026horse');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Correct2026horse', hash)).toBe(true);
    expect(await verifyPassword('Wrong2026horse', hash)).toBe(false);
  });

  it('uses a new salt for every hash', async () => {
    expect(await hashPassword('Same2026password')).not.toBe(await hashPassword('Same2026password'));
  });

  it('requires 10 characters with letters and numbers', () => {
    expect(isStrongPassword('short1')).toBe(false);
    expect(isStrongPassword('onlyletterslong')).toBe(false);
    expect(isStrongPassword('Letters2026ok')).toBe(true);
  });
});
