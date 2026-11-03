/**
 * Prize draw (docs: rules-sessions-and-prizes.md, sections 4 and 7).
 *
 * Every play wins a prize, as in the project document ("every completed play produces a reference").
 * Main prizes wait for their secret winning moments (release-schedule.ts), so they are spread
 * across the session. They are also released in step with the filler: when half the filler is
 * given, at least half the main prizes are due, so a big crowd that uses the stock up early still
 * sees main prizes spread across its plays. Every other play gets a filler prize (any prize not
 * marked main, such as chocolate). When the filler runs out, the main prizes left go to the next players.
 * One prize per play. The prize itself is picked in proportion to what is left.
 * Pure functions: the random source is passed in, so tests are repeatable.
 */
import { randomInt } from 'node:crypto';
import { type ReleasePool, type ReleaseWindow, releasedBy } from './release-schedule.js';

export interface DrawCandidate {
  prizeId: string;
  isMainPrize: boolean;
  allocated: number;
  remaining: number;
  given: number;
}

export interface DrawOptions {
  /** Time of the play in milliseconds */
  now: number;
  window: ReleaseWindow;
  /** Repeat-winner rule: the visitor already won a main prize today */
  excludeMainPrizes: boolean;
  /** Secure random integer in [0, max). Defaults to crypto.randomInt */
  random?: (max: number) => number;
}

/** There is never a "try again": without a prize the visitor cannot play */
export type NoPrizeReason = 'NO_PRIZES_LEFT' | 'MAIN_PRIZE_ALREADY_WON';

const sum = (rows: DrawCandidate[], field: 'allocated' | 'given') => rows.reduce((s, r) => s + r[field], 0);

/** True when a moment of this pool has passed and is not yet claimed */
export function isDue(
  pool: DrawCandidate[],
  kind: ReleasePool,
  options: Pick<DrawOptions, 'now' | 'window'>,
) {
  if (!pool.some((c) => c.remaining > 0)) return false;
  return releasedBy(sum(pool, 'allocated'), options.window, kind, options.now) > sum(pool, 'given');
}

/** True when main prizes fall behind the share of filler already given */
export function dueByFillerUse(main: DrawCandidate[], filler: DrawCandidate[]) {
  const fillerTotal = sum(filler, 'allocated');
  if (!main.some((c) => c.remaining > 0) || fillerTotal === 0) return false;
  const due = Math.floor((sum(main, 'allocated') * sum(filler, 'given')) / fillerTotal);
  return due > sum(main, 'given');
}

/** Picks one prize in proportion to the remaining quantities. */
export function pickWeighted(
  pool: DrawCandidate[],
  random: (max: number) => number = randomInt,
): DrawCandidate {
  const left = pool.filter((c) => c.remaining > 0);
  const total = left.reduce((s, c) => s + c.remaining, 0);
  const r = random(total);
  let running = 0;
  for (const candidate of left) {
    running += candidate.remaining;
    if (running > r) return candidate;
  }
  // Not reachable while r < total, kept as a safe fallback
  return left[left.length - 1] as DrawCandidate;
}

/**
 * The prize for one play, or the reason there is none.
 * 1. A waiting main prize moment goes first, unless the visitor already won a main prize today
 *    (then it waits for the next player).
 * 2. Otherwise a filler prize.
 * 3. No filler left: a main prize, or none for a visitor who already won a main prize today.
 */
export function drawPrize(
  candidates: DrawCandidate[],
  options: DrawOptions,
): { prize: DrawCandidate; reason?: undefined } | { prize: null; reason: NoPrizeReason } {
  if (!candidates.some((c) => c.remaining > 0)) return { prize: null, reason: 'NO_PRIZES_LEFT' };
  const main = candidates.filter((c) => c.isMainPrize);
  const other = candidates.filter((c) => !c.isMainPrize);

  if (!options.excludeMainPrizes && (isDue(main, 'main', options) || dueByFillerUse(main, other))) {
    return { prize: pickWeighted(main, options.random) };
  }
  if (other.some((c) => c.remaining > 0)) return { prize: pickWeighted(other, options.random) };
  if (options.excludeMainPrizes) return { prize: null, reason: 'MAIN_PRIZE_ALREADY_WON' };
  return { prize: pickWeighted(main, options.random) };
}
