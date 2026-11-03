import { describe, expect, it } from 'vitest';
import { type DrawCandidate, drawPrize, pickWeighted } from '../src/domain/draw.js';
import { type ReleaseWindow, releaseTimes } from '../src/domain/release-schedule.js';

const prize = (prizeId: string, remaining: number, extra: Partial<DrawCandidate> = {}): DrawCandidate => ({
  prizeId,
  isMainPrize: false,
  allocated: remaining,
  remaining,
  given: 0,
  ...extra,
});

const HOUR = 3_600_000;
const WINDOW: ReleaseWindow = { startMs: 0, endMs: 2 * HOUR, seed: 'ses_test|2026-10-30|spin' };
const END = WINDOW.endMs;

// Example from the rules document: 42 units left in total
const POOL = [
  prize('pen-drive', 7, { isMainPrize: true }),
  prize('domain', 3, { isMainPrize: true }),
  prize('headset', 3, { isMainPrize: true }),
  prize('power-bank', 3, { isMainPrize: true }),
  prize('umbrella', 1, { isMainPrize: true }),
  prize('chocolate', 25),
];

describe('weighted pick', () => {
  it('walks the list: r = 0 to 6 is a pen drive, r = 7 is a domain', () => {
    expect(pickWeighted(POOL, () => 0).prizeId).toBe('pen-drive');
    expect(pickWeighted(POOL, () => 6).prizeId).toBe('pen-drive');
    expect(pickWeighted(POOL, () => 7).prizeId).toBe('domain');
    expect(pickWeighted(POOL, () => 41).prizeId).toBe('chocolate');
  });

  it('matches the remaining ratios over 100,000 secure picks', () => {
    const counts: Record<string, number> = {};
    const runs = 100_000;
    for (let i = 0; i < runs; i++) {
      const id = pickWeighted(POOL).prizeId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect((counts.chocolate ?? 0) / runs).toBeCloseTo(25 / 42, 1);
    expect((counts['pen-drive'] ?? 0) / runs).toBeCloseTo(7 / 42, 1);
  });

  it('never picks a prize with nothing left', () => {
    const pool = [prize('a', 0), prize('b', 2)];
    for (let r = 0; r < 2; r++) expect(pickWeighted(pool, () => r).prizeId).toBe('b');
  });
});

describe('every play wins (project document)', () => {
  const options = (now: number, excludeMainPrizes = false) => ({ now, window: WINDOW, excludeMainPrizes });
  const mainPen = (remaining: number, extra: Partial<DrawCandidate> = {}) =>
    prize('pen', remaining, { isMainPrize: true, ...extra });

  it('gives a filler prize before the first main prize moment', () => {
    const first = Math.min(...releaseTimes(4, WINDOW, 'main'));
    const result = drawPrize([mainPen(4), prize('chocolate', 20)], options(first - 1));
    expect(result.prize?.prizeId).toBe('chocolate');
  });

  it('gives the main prize once its moment has passed, then filler again', () => {
    const [first, second] = releaseTimes(4, WINDOW, 'main') as [number, number];
    expect(drawPrize([mainPen(4), prize('chocolate', 20)], options(first)).prize?.prizeId).toBe('pen');
    // the moment is claimed: the next play before the second moment gets chocolate
    const claimed = [mainPen(3, { allocated: 4, given: 1 }), prize('chocolate', 20)];
    expect(drawPrize(claimed, options(Math.min(second - 1, first + 1))).prize?.prizeId).toBe('chocolate');
  });

  it('never returns "try again" while any prize is left', () => {
    for (let now = 0; now <= END; now += 60_000) {
      expect(drawPrize([mainPen(4), prize('chocolate', 1)], options(now)).prize).not.toBeNull();
      expect(drawPrize([mainPen(4)], options(now)).prize?.prizeId).toBe('pen');
    }
  });

  it('gives the main prizes left when the filler has run out, even before their moments', () => {
    const pool = [mainPen(4), prize('chocolate', 0, { allocated: 20, given: 20 })];
    expect(drawPrize(pool, options(0)).prize?.prizeId).toBe('pen');
  });

  it('reports NO_PRIZES_LEFT when the session is used up', () => {
    expect(drawPrize([prize('a', 0, { allocated: 3, given: 3 })], options(END))).toEqual({
      prize: null,
      reason: 'NO_PRIZES_LEFT',
    });
  });
});

describe('repeat-winner rule', () => {
  it('a main prize moment waits for the next player when this visitor already won one today', () => {
    const pool = [prize('pen', 4, { isMainPrize: true }), prize('cap', 20)];
    expect(drawPrize(pool, { now: END, window: WINDOW, excludeMainPrizes: true }).prize?.prizeId).toBe('cap');
  });

  it('reports MAIN_PRIZE_ALREADY_WON when only main prizes are left', () => {
    const result = drawPrize([prize('pen', 2, { isMainPrize: true })], {
      now: END,
      window: WINDOW,
      excludeMainPrizes: true,
    });
    expect(result.reason).toBe('MAIN_PRIZE_ALREADY_WON');
  });
});
