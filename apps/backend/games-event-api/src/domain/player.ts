/**
 * Player details typed on the phone before playing (name and phone, not validated).
 */

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
