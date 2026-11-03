/**
 * Time helpers. Every event time is Asia/Colombo (UTC+05:30, no daylight saving)
 * and decided by the server clock.
 *
 * NOTE: copied into each backend service.
 */
const OFFSET_MINUTES = 330;
const OFFSET_LABEL = '+05:30';

/** ISO 8601 with the Colombo offset, for example `2026-11-02T10:14:05+05:30`. */
export function toColomboIso(date: Date): string {
  const local = new Date(date.getTime() + OFFSET_MINUTES * 60_000);
  return `${local.toISOString().slice(0, 19)}${OFFSET_LABEL}`;
}

export const nowIso = (): string => toColomboIso(new Date());

/** Calendar date in Colombo, for example `2026-11-02`. */
export function colomboDate(date: Date = new Date()): string {
  return toColomboIso(date).slice(0, 10);
}

/** Builds a Colombo timestamp from a date and a `HH:mm` time. */
export function atColomboTime(date: string, time: string): string {
  return `${date}T${time}:00${OFFSET_LABEL}`;
}

export const ms = (iso: string): number => new Date(iso).getTime();

export function addSeconds(iso: string, seconds: number): string {
  return toColomboIso(new Date(ms(iso) + seconds * 1000));
}

/** Unix seconds, used for DynamoDB TTL attributes. */
export const epochSeconds = (date: Date = new Date()): number => Math.floor(date.getTime() / 1000);
