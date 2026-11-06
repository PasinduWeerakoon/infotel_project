/**
 * Phone numbers of guest players (not signed in to QuickLook). The number is the guest's identity
 * for the one play per session rule, so the same number typed in different ways is the same player:
 * "077 123 4567", "0771234567", "+94 77 123 4567" and "94771234567" are all "0771234567".
 * Sri Lankan numbers are kept in the local 0 form; other countries need a leading +.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace('+', '');
  if (/^94\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^0\d{9}$/.test(compact)) return compact;
  if (/^7\d{8}$/.test(compact)) return `0${compact}`;
  if (compact.startsWith('+') && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}
