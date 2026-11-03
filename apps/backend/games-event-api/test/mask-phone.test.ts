import { describe, expect, it } from 'vitest';
import { maskPhone } from '../src/domain/player.js';

describe('maskPhone (big screens)', () => {
  it('keeps the first 3 and last 3 digits of a normal number', () => {
    expect(maskPhone('0771234567')).toBe('077****567');
    expect(maskPhone('077 123 4567')).toBe('077 *** *567');
    expect(maskPhone('+94771234567')).toBe('+947*****567');
  });
  it('hides all but the last 3 digits of a short number', () => {
    expect(maskPhone('123456')).toBe('***456');
  });
  it('hides every digit of a very short number', () => {
    expect(maskPhone('12')).toBe('**');
  });
  it('leaves text that has no digits alone', () => {
    expect(maskPhone('none')).toBe('none');
  });
});
