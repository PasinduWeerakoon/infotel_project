import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/domain/phone.js';

describe('normalizePhone', () => {
  it('treats the same Sri Lankan number typed in different ways as one number', () => {
    for (const typed of [
      '077 123 4567',
      '0771234567',
      '+94 77 123 4567',
      '94771234567',
      '771234567',
      '077-123-4567',
    ])
      expect(normalizePhone(typed)).toBe('0771234567');
  });
  it('keeps other countries with a leading +', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
  });
  it('refuses numbers that are not phone numbers', () => {
    for (const typed of ['', 'abc', '12345', '077123456', '07712345678', '+12', '0771234567x'])
      expect(normalizePhone(typed)).toBeNull();
  });
});
