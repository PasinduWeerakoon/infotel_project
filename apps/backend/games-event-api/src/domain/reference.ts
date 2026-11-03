/**
 * Prize references such as `LKD-7Q4K-29`.
 * Random (about one billion combinations), stored on the server, collected once.
 * The alphabet has no 0, O, 1 or I, so references are easy to read out at the prize desk.
 */
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newReference(random: (max: number) => number = randomInt): string {
  const chars = Array.from({ length: 6 }, () => ALPHABET[random(ALPHABET.length)]).join('');
  return `LKD-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Accepts what staff type (spaces, lower case, missing dashes) and returns the stored form. */
export function normalizeReference(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = clean.startsWith('LKD') ? clean.slice(3) : clean;
  if (body.length !== 6 || [...body].some((c) => !ALPHABET.includes(c))) return null;
  return `LKD-${body.slice(0, 4)}-${body.slice(4)}`;
}
