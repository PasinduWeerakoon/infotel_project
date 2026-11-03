import { describe, expect, it } from 'vitest';
import {
  EARLY_SPAN_MS,
  END_GAP_MS,
  type ReleaseWindow,
  earlyCount,
  releaseTimes,
  releasedBy,
} from '../src/domain/release-schedule.js';
import { releaseWindow } from '../src/domain/sessions.js';
import type { Session } from '../src/domain/types.js';

const HOUR = 3_600_000;
const window = (hours: number, seed = 'ses_a|2026-10-30T03:00:00Z|spin'): ReleaseWindow => ({
  startMs: 1_000_000,
  endMs: 1_000_000 + hours * HOUR,
  seed,
});

describe('release times', () => {
  it('gives one moment per unit', () => {
    expect(releaseTimes(54, window(2), 'other')).toHaveLength(54);
    expect(releaseTimes(0, window(2), 'other')).toEqual([]);
  });

  it('puts the early moments in the first 5 minutes', () => {
    const w = window(2);
    const times = releaseTimes(50, w, 'other');
    const early = times.filter((t) => t < w.startMs + EARLY_SPAN_MS).length;
    expect(early).toBeGreaterThanOrEqual(earlyCount(50));
    expect(earlyCount(50)).toBe(2);
    expect(earlyCount(5)).toBe(1);
    expect(earlyCount(3)).toBe(0);
  });

  it('main prizes get no early moments', () => {
    const w = window(4);
    const times = releaseTimes(4, w, 'main');
    expect(times[0]).toBeGreaterThan(w.startMs + 0); // first one is somewhere in the first hour
    expect(times.filter((t) => t < w.startMs + HOUR)).toHaveLength(1);
  });

  it('has no moments in the last 10% of the session, 10 minutes at most', () => {
    for (const hours of [1, 2, 3]) {
      const w = window(hours);
      const gap = Math.min(END_GAP_MS, hours * HOUR * 0.1);
      expect(Math.max(...releaseTimes(200, w, 'other'))).toBeLessThanOrEqual(w.endMs - gap);
    }
  });

  it('a 1 hour session stops new moments in the last 6 minutes', () => {
    const w = { startMs: 0, endMs: HOUR, seed: 's' };
    expect(Math.max(...releaseTimes(30, w, 'other'))).toBeLessThanOrEqual(54 * 60_000);
  });

  it('spreads evenly: every 30 minutes of a 2 hour session gets a fair share', () => {
    const w = window(2);
    const times = releaseTimes(100, w, 'other');
    const quarters = [0, 1, 2, 3].map(
      (q) =>
        times.filter((t) => t >= w.startMs + q * 0.5 * HOUR && t < w.startMs + (q + 1) * 0.5 * HOUR).length,
    );
    // the last 30 minutes are shorter for moments, because the last 10 have none
    for (const count of quarters.slice(0, 3)) {
      expect(count).toBeGreaterThanOrEqual(24);
      expect(count).toBeLessThanOrEqual(30);
    }
    expect(quarters[3]).toBeGreaterThanOrEqual(15);
  });

  it('is the same on every play (no storage needed) and different per session', () => {
    expect(releaseTimes(30, window(2), 'other')).toEqual(releaseTimes(30, window(2), 'other'));
    expect(releaseTimes(30, window(2, 'other-seed'), 'other')).not.toEqual(
      releaseTimes(30, window(2), 'other'),
    );
  });

  it('counts what is released by a given time', () => {
    const w = window(2);
    expect(releasedBy(40, w, 'other', w.startMs - 1)).toBe(0);
    expect(releasedBy(40, w, 'other', w.endMs - END_GAP_MS)).toBe(40);
    const half = releasedBy(40, w, 'other', w.startMs + HOUR);
    expect(half).toBeGreaterThanOrEqual(19);
    expect(half).toBeLessThanOrEqual(24);
  });
});

describe('release window of a session', () => {
  const session: Session = {
    sessionId: 'ses_a',
    name: 'Morning',
    date: '2026-10-30',
    startsAt: '2026-10-30T04:30:00.000Z',
    endsAt: '2026-10-30T06:30:00.000Z',
    games: ['spin'],
    override: null,
    rolledOver: false,
    createdAt: '2026-10-29T10:00:00.000Z',
  };

  it('follows the start and end times', () => {
    const w = releaseWindow(session, 'spin');
    expect(w.startMs).toBe(Date.parse(session.startsAt));
    expect(w.endMs).toBe(Date.parse(session.endsAt));
  });

  it('starts when staff opened it early', () => {
    const early = { ...session, override: 'open' as const, openedAt: '2026-10-30T04:10:00.000Z' };
    expect(releaseWindow(early, 'spin').startMs).toBe(Date.parse('2026-10-30T04:10:00.000Z'));
  });

  it('has a different seed per game', () => {
    expect(releaseWindow(session, 'spin').seed).not.toBe(releaseWindow(session, 'lucky-dip').seed);
  });
});
