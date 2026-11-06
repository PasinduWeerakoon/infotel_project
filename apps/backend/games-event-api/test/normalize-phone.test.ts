import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/domain/player.js';

describe('normalizePhone (QuickLook winner phone)', () => {
  it('keeps Sri Lankan numbers in the local 0 form', () => {
    expect(normalizePhone('077 123 4567')).toBe('0771234567');
    expect(normalizePhone('+94 77 123 4567')).toBe('0771234567');
    expect(normalizePhone('94771234567')).toBe('0771234567');
    expect(normalizePhone('771234567')).toBe('0771234567');
  });
  it('needs a leading + for other countries', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('refuses text and short numbers', () => {
    expect(normalizePhone('12345abc')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});
