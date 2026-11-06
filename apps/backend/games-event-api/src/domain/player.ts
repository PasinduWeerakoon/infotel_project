/**
 * Player details typed on the phone before playing (name and phone, not validated).
 * A QuickLook player types the phone only after a win, and that number is checked.
 */

/**
 * The same rule as guest sign in (platform-api): "077 123 4567", "+94 77 123 4567" and
 * "94771234567" are all "0771234567". Other countries need a leading +. Null when not valid.
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

/** The screens are public, so they get 077****567 instead of the full number */
export function maskPhone(phone: string): string {
  const digits = [...phone].filter((c) => c >= '0' && c <= '9').length;
  const keepStart = digits >= 8 ? 3 : 0;
  const keepEnd = digits >= 4 ? 3 : 0;
  let seen = 0;
  return [...phone]
    .map((c) => {
      if (c < '0' || c > '9') return c;
      seen++;
      return seen <= keepStart || seen > digits - keepEnd ? c : '*';
    })
    .join('');
}
