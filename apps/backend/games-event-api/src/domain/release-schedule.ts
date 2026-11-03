/**
 * Winning moments (docs: rules-sessions-and-prizes.md, section 4).
 *
 * Each prize unit of a session and game gets a secret release time. The first player after a
 * release time wins it. Times are spread over the session so prizes are not all won by the first
 * players, and the win chance follows the crowd on its own: busy hours share the same moments,
 * quiet hours let the next player win what is waiting.
 *
 * The times are not stored. They are worked out again on every play from a seed that only the
 * server knows, so changing an allocation simply gives a new count of moments.
 * Pure functions, so tests are repeatable.
 */
import { createHash } from 'node:crypto';

/** Main prizes and other prizes have separate moments, so a main prize is never "used up" by a cap */
export type ReleasePool = 'main' | 'other';

export interface ReleaseWindow {
  /** When play started (the start time, or earlier when staff opened the session early) */
  startMs: number;
  endMs: number;
  /** Secret per session and game, never sent to phones */
  seed: string;
}

/** The first moments of other prizes fall in the first 5 minutes, to welcome early players */
export const EARLY_SPAN_MS = 5 * 60_000;
/** No new moments in the last 10% of the session (10 minutes at most), so what is left goes before the end */
export const END_GAP_MS = 10 * 60_000;

/** Early moments for other prizes: 2 from 10 units, 1 from 4 units, none below that */
export const earlyCount = (count: number): number => (count >= 10 ? 2 : count >= 4 ? 1 : 0);

/** Small seeded random source (mulberry32), returns numbers from 0 to 1 */
function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Release times for `count` units, earliest first.
 * The spread part of the session is cut into `count` equal slots with one random moment in each,
 * so moments never bunch up, but nobody can guess them.
 */
export function releaseTimes(count: number, window: ReleaseWindow, pool: ReleasePool): number[] {
  if (count <= 0) return [];
  const length = Math.max(1, window.endMs - window.startMs);
  const span = Math.max(1, length - Math.min(END_GAP_MS, length * 0.1));
  const random = seededRandom(`${window.seed}|${pool}|${count}`);
  const early = pool === 'other' ? earlyCount(count) : 0;
  const earlySpan = Math.min(EARLY_SPAN_MS, span * 0.1);

  const times: number[] = [];
  for (let i = 0; i < early; i++) times.push(window.startMs + ((i + random()) / early) * earlySpan);
  const rest = count - early;
  for (let i = 0; i < rest; i++) times.push(window.startMs + ((i + random()) / rest) * span);
  return times.sort((a, b) => a - b);
}

/** How many of `count` units are released by `now` */
export function releasedBy(count: number, window: ReleaseWindow, pool: ReleasePool, now: number): number {
  return releaseTimes(count, window, pool).filter((at) => at <= now).length;
}
