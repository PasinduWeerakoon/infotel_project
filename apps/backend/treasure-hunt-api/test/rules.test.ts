import { describe, expect, it } from 'vitest';
import {
  UNRANKED,
  huntStatus,
  leaderboardKey,
  pickWinners,
  pointsFor,
  prizeForRank,
  scanPeriod,
  sessionToShow,
  startEarlyProblem,
} from '../src/domain/rules.js';
import type { HuntSession, Participant } from '../src/domain/types.js';

const session = (id: string, start: string, end: string, extra: Partial<HuntSession> = {}): HuntSession => ({
  sessionId: id,
  name: id,
  date: '2026-11-02',
  startsAt: `2026-11-02T${start}:00+05:30`,
  endsAt: `2026-11-02T${end}:00+05:30`,
  override: null,
  pointsPerStall: 10,
  winnersCount: 3,
  prizes: [],
  allowPreviousWinners: false,
  logos: [],
  finalized: false,
  createdAt: '2026-10-27T10:00:00+05:30',
  ...extra,
});
const at = (time: string) => new Date(`2026-11-02T${time}:00+05:30`);
/** A participant as read from QuickLook: its rank already includes the tie-break */
const player = (
  userId: string,
  rank: number,
  stalls: number,
  extra: Partial<Participant> = {},
): Participant => ({
  sessionId: 's1',
  userId,
  playerNumber: rank,
  fullName: `Player ${userId}`,
  mobile: '0770000000',
  rank,
  stalls,
  points: stalls * 10,
  totalScans: stalls,
  reachedAt: '2026-11-02T10:00:00.000000+05:30',
  logos: [],
  disqualified: false,
  ...extra,
});

describe('hunt sessions', () => {
  it('scores by scan time: a scan after the end is outside the session', () => {
    const s = session('s1', '09:00', '12:00');
    expect(huntStatus(s, at('11:59'))).toBe('open');
    expect(huntStatus(s, at('12:00'))).toBe('closed');
  });

  it('shows the latest ended session when none is open', () => {
    const sessions = [
      session('s1', '09:00', '10:00'),
      session('s2', '10:00', '11:00'),
      session('s3', '13:00', '14:00'),
    ];
    expect(sessionToShow(sessions, at('12:00'))?.sessionId).toBe('s2');
  });
});

describe('leaderboard order (QuickLook rank)', () => {
  it('sorts by rank as text, so rank 2 comes before rank 10', () => {
    expect(leaderboardKey(2) < leaderboardKey(10)).toBe(true);
    expect(leaderboardKey(999) < leaderboardKey(1000)).toBe(true);
  });

  it('puts players QuickLook no longer lists last', () => {
    expect(leaderboardKey(1000) < leaderboardKey(UNRANKED)).toBe(true);
  });

  it('shows points as stalls times the points per stall', () => {
    expect(pointsFor(7, 10)).toBe(70);
  });
});

describe('scan period sent to QuickLook', () => {
  it('follows the session times', () => {
    expect(scanPeriod(session('s1', '09:00', '12:00'))).toEqual({
      start: '2026-11-02T09:00:00+05:30',
      end: '2026-11-02T12:00:00+05:30',
    });
  });

  it('starts when staff opened it early, and ends when staff ended it early', () => {
    const opened = session('s1', '09:00', '12:00', {
      override: 'open',
      openedAt: '2026-11-02T03:15:00.000Z',
    });
    expect(scanPeriod(opened).start).toBe('2026-11-02T03:15:00.000Z');
    const closed = session('s1', '09:00', '12:00', {
      override: 'closed',
      openedAt: '2026-11-02T03:15:00.000Z',
      closedAt: '2026-11-02T05:00:00.000Z',
    });
    expect(scanPeriod(closed)).toEqual({
      start: '2026-11-02T09:00:00+05:30',
      end: '2026-11-02T05:00:00.000Z',
    });
  });
});

describe('winners', () => {
  // b and c have the same count: QuickLook ranked c first because c reached it earlier
  const ranked = [player('b', 3, 7), player('a', 1, 9), player('d', 4, 6), player('c', 2, 7)];

  it('takes the top N in QuickLook rank order', () => {
    const winners = pickWinners({ ranked, count: 3, excludeUserIds: new Set() });
    expect(winners.map((w) => w.userId)).toEqual(['a', 'c', 'b']);
  });

  it('never picks a player with no stalls', () => {
    const list = [player('a', 1, 2), player('z', UNRANKED, 0)];
    expect(pickWinners({ ranked: list, count: 3, excludeUserIds: new Set() }).map((w) => w.userId)).toEqual([
      'a',
    ]);
  });

  it('moves everyone up when a player is disqualified', () => {
    const list = ranked.map((p) => (p.userId === 'a' ? { ...p, disqualified: true } : p));
    expect(pickWinners({ ranked: list, count: 3, excludeUserIds: new Set() }).map((w) => w.userId)).toEqual([
      'c',
      'b',
      'd',
    ]);
  });

  it('skips players who already won today when previous winners are not allowed', () => {
    expect(pickWinners({ ranked, count: 2, excludeUserIds: new Set(['a']) }).map((w) => w.userId)).toEqual([
      'c',
      'b',
    ]);
  });

  it('finds the prize for a rank', () => {
    expect(prizeForRank([{ rank: 1, prizeName: 'Headset' }], 1)).toBe('Headset');
    expect(prizeForRank([{ rank: 1, prizeName: 'Headset' }], 2)).toBeNull();
  });
});

describe('starting a hunt session early', () => {
  const first = session('first', '09:00', '11:00');
  const second = session('second', '12:00', '14:00');
  const third = session('third', '15:00', '17:00');
  const today = [first, second, third];

  it('allows the next session when nothing is running', () => {
    expect(startEarlyProblem(second, today, '2026-11-02', at('11:30'))).toBeNull();
  });

  it('refuses while another session is running, or to skip a waiting one', () => {
    expect(startEarlyProblem(second, today, '2026-11-02', at('10:00'))).toBe('ANOTHER_SESSION_OPEN');
    expect(startEarlyProblem(third, today, '2026-11-02', at('11:30'))).toBe('NOT_NEXT_SESSION');
  });

  it("refuses another day's session, an ended one and a finalized one", () => {
    expect(startEarlyProblem(second, today, '2026-11-03', at('11:30'))).toBe('NOT_TODAY');
    expect(startEarlyProblem(first, today, '2026-11-02', at('11:30'))).toBe('ALREADY_ENDED');
    const finalized = { ...second, override: 'closed' as const, finalized: true };
    expect(startEarlyProblem(finalized, [first, finalized, third], '2026-11-02', at('12:30'))).toBe(
      'ALREADY_ENDED',
    );
  });
});
