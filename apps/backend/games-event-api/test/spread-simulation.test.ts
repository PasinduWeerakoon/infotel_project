/**
 * Simulated sessions through the real draw: one game, one player at a time, 30 seconds per turn.
 * Every play wins while prizes are left (project document). Fails if a player leaves without a
 * prize while stock is left, if main prizes bunch up at the start, or if stock is ever exceeded.
 */
import { describe, expect, it } from 'vitest';
import { type DrawCandidate, drawPrize } from '../src/domain/draw.js';
import type { ReleaseWindow } from '../src/domain/release-schedule.js';

const HOUR = 3_600_000;
const TURN = 30_000;
const RUNS = 60;

type Rate = (t: number) => number; // people arriving per hour at time t

function playTimes(lengthMs: number, rate: Rate): number[] {
  const plays: number[] = [];
  let t = 0;
  let free = 0;
  while (t < lengthMs) {
    t += (-Math.log(1 - Math.random()) / rate(t)) * HOUR;
    const start = Math.max(t, free);
    if (start >= lengthMs) break;
    plays.push(start);
    free = start + TURN;
  }
  return plays;
}

function simulate(hours: number, rate: Rate, filler: number, main: number) {
  const lengthMs = hours * HOUR;
  let players = 0;
  let given = 0;
  let emptyHanded = 0; // played while stock was left but got nothing (must stay 0)
  let duplicates = 0;
  let mainGiven = 0;
  let mainFirstTenMinutes = 0;
  const mainPerQuarter = [0, 0, 0, 0]; // by quarter of the plays that won, not of the clock
  for (let run = 0; run < RUNS; run++) {
    const window: ReleaseWindow = { startMs: 0, endMs: lengthMs, seed: `sim-${run}-${Math.random()}` };
    const pool: DrawCandidate[] = [
      { prizeId: 'chocolate', isMainPrize: false, allocated: filler, remaining: filler, given: 0 },
      { prizeId: 'pen', isMainPrize: true, allocated: main, remaining: main, given: 0 },
    ];
    const plays = playTimes(lengthMs, rate);
    players += plays.length;
    const winners = Math.min(plays.length, filler + main);
    for (const [index, now] of plays.entries()) {
      const stockLeft = pool.some((c) => c.remaining > 0);
      const { prize } = drawPrize(pool, { now, window, excludeMainPrizes: false });
      if (!prize) {
        if (stockLeft) emptyHanded++;
        continue;
      }
      if (prize.remaining <= 0) duplicates++;
      prize.remaining--;
      prize.given++;
      given++;
      if (prize.isMainPrize) {
        mainGiven++;
        if (now < 10 * 60_000) mainFirstTenMinutes++;
        const quarter = Math.min(3, Math.floor((index / winners) * 4));
        mainPerQuarter[quarter] = (mainPerQuarter[quarter] ?? 0) + 1;
      }
    }
  }
  return {
    playersPerRun: players / RUNS,
    givenShare: given / ((filler + main) * RUNS),
    emptyHanded,
    duplicates,
    mainGivenShare: mainGiven / (main * RUNS),
    mainQuarterShare: mainPerQuarter.map((q) => q / Math.max(1, mainGiven)),
    mainFirstTenMinutesShare: mainFirstTenMinutes / Math.max(1, mainGiven),
  };
}

describe('2 hour session, stock sized for the crowd as in the document (chocolate + 10 main prizes)', () => {
  const scenarios: [string, Rate][] = [
    ['normal crowd, 90 per hour', () => 90],
    ['queue all the time', () => 200],
    [
      'quiet first and last half hour, peak in the middle',
      (t) => (t > 0.5 * HOUR && t < 1.5 * HOUR ? 220 : 40),
    ],
  ];

  // Main prizes are spread across the players who win: each quarter of them gets about a quarter
  it.each(scenarios)('%s: everyone wins, main prizes spread across the players', (_name, rate) => {
    const result = simulate(2, rate, 140, 10);
    expect(result.emptyHanded).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.mainGivenShare).toBeGreaterThan(0.95);
    // Main prizes follow the clock, so a quiet quarter of players can get a little more than 25%
    for (const share of result.mainQuarterShare) {
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.42);
    }
    // not the old "first players win everything": 10 of 110 minutes is about 9%
    expect(result.mainFirstTenMinutesShare).toBeLessThan(0.2);
  });
});

describe('edge cases', () => {
  it('more players than prizes: everyone wins until the stock is gone, never more than the stock', () => {
    const result = simulate(2, () => 400, 30, 4);
    expect(result.emptyHanded).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.givenShare).toBe(1);
  });

  it('a quiet day: every player wins, main prizes are still all given', () => {
    const result = simulate(2, () => 20, 140, 6);
    expect(result.emptyHanded).toBe(0);
    expect(result.mainGivenShare).toBeGreaterThan(0.95);
  });

  it.each([1, 3])('works the same for a %s hour session', (hours) => {
    const result = simulate(hours, () => 100, 60 * hours, 6 * hours);
    expect(result.emptyHanded).toBe(0);
    expect(result.mainGivenShare).toBeGreaterThan(0.95);
    for (const share of result.mainQuarterShare) expect(share).toBeGreaterThan(0.1);
  });
});
