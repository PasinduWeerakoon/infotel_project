import { describe, expect, it } from 'vitest';
import {
  countReachedAt,
  huntStatus,
  leaderboardKey,
  pickWinners,
  pointsFor,
  prizeForRank,
  scanPeriod,
  sessionForScan,
  sessionToShow,
  startEarlyProblem,
  withRanks,
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
  finalized: false,
  createdAt: '2026-10-27T10:00:00+05:30',
  ...extra,
});
const at = (time: string) => new Date(`2026-11-02T${time}:00+05:30`);
/** A participant with a count reached at a time of day */
const player = (
  userId: string,
  stalls: number,
  reachedAt: string,
  extra: Partial<Participant> = {},
): Participant => ({
  sessionId: 's1',
  userId,
  playerNumber: userId.charCodeAt(0),
  fullName: `Player ${userId}`,
  stalls,
  points: stalls * 10,
  totalScans: stalls,
  reachedAt: `2026-11-02T${reachedAt}:00+05:30`,
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

describe('leaderboard order', () => {
  it('puts the most different logos first, as text, so 10 logos come before 9', () => {
    expect(
      leaderboardKey(10, '2026-11-02T11:00:00Z', 'u1') < leaderboardKey(9, '2026-11-02T09:00:00Z', 'u1'),
    ).toBe(true);
  });

  it('breaks a tie by who reached the count first', () => {
    expect(
      leaderboardKey(5, '2026-11-02T09:00:00Z', 'u9') < leaderboardKey(5, '2026-11-02T09:00:01Z', 'u1'),
    ).toBe(true);
    // The same moment in another timezone sorts the same
    expect(leaderboardKey(5, '2026-11-02T14:30:00+05:30', 'u1')).toBe(
      leaderboardKey(5, '2026-11-02T09:00:00Z', 'u1'),
    );
    // Same count, same millisecond: the user ID decides, in the index and in the admin order alike
    expect(
      leaderboardKey(5, '2026-11-02T09:00:00Z', 'a') < leaderboardKey(5, '2026-11-02T09:00:00Z', 'b'),
    ).toBe(true);
  });

  it('ranks 1, 2, 3 and leaves out disqualified players and players with no logos', () => {
    const list = [
      player('a', 3, '10:05'),
      player('b', 5, '10:20'),
      player('c', 3, '10:01'),
      player('d', 9, '10:00', { disqualified: true }),
      player('e', 0, '10:00'),
    ];
    expect(withRanks(list).map((p) => [p.userId, p.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('shows points as stalls times the points per stall', () => {
    expect(pointsFor(7, 10)).toBe(70);
  });
});

describe('the session a scan counts in', () => {
  const morning = session('s1', '09:00', '12:00');
  const afternoon = session('s2', '13:00', '15:00');

  it('counts a scan inside a session, and not between or after sessions', () => {
    expect(sessionForScan([morning, afternoon], at('11:59'))?.sessionId).toBe('s1');
    expect(sessionForScan([morning, afternoon], at('12:30'))).toBeUndefined();
    expect(sessionForScan([morning, afternoon], at('13:00'))?.sessionId).toBe('s2');
    expect(sessionForScan([morning, afternoon], at('15:00'))).toBeUndefined();
  });

  it('follows "Start now" and "End now", and never counts in a finalized session', () => {
    const ended = { ...morning, override: 'closed' as const, closedAt: '2026-11-02T05:00:00.000Z' }; // 10:30
    expect(sessionForScan([ended], at('10:29'))?.sessionId).toBe('s1');
    expect(sessionForScan([ended], at('10:31'))).toBeUndefined();
    const early = { ...afternoon, override: 'open' as const, openedAt: '2026-11-02T07:00:00.000Z' }; // 12:30
    expect(sessionForScan([early], at('12:45'))?.sessionId).toBe('s2');
    expect(sessionForScan([{ ...morning, finalized: true }], at('10:00'))).toBeUndefined();
  });
});

describe('scan period', () => {
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
  // b and c have the same count: c reached it earlier, so c is ahead
  const ranked = [
    player('b', 7, '10:30'),
    player('a', 9, '10:40'),
    player('d', 6, '10:00'),
    player('c', 7, '10:10'),
  ];

  it('takes the top N in leaderboard order', () => {
    const winners = pickWinners({ ranked, count: 3, excludeUserIds: new Set() });
    expect(winners.map((w) => w.userId)).toEqual(['a', 'c', 'b']);
  });

  it('never picks a player with no stalls', () => {
    const list = [player('a', 2, '10:00'), player('z', 0, '09:00')];
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

describe('when a count was reached', () => {
  const logos = (...times: string[]) => times.map((t, i) => ({ logoId: `l${i}`, firstScannedAt: t }));
  it('is the latest scan time of the counted logos', () => {
    expect(
      countReachedAt({ reachedAt: 'x', logos: logos('2026-11-05T10:00:01Z', '2026-11-05T10:00:05Z') }),
    ).toBe('2026-11-05T10:00:05.000Z');
  });
  it('does not move back when an older scan arrives last', () => {
    expect(
      countReachedAt({ reachedAt: 'x', logos: logos('2026-11-05T10:00:05Z', '2026-11-05T10:00:01Z') }),
    ).toBe('2026-11-05T10:00:05.000Z');
  });
  it('compares times in any time zone', () => {
    expect(
      countReachedAt({ reachedAt: 'x', logos: logos('2026-11-05T15:30:05+05:30', '2026-11-05T10:00:01Z') }),
    ).toBe('2026-11-05T10:00:05.000Z');
  });
  it('keeps the stored time when no logo counted yet', () => {
    expect(countReachedAt({ reachedAt: '2026-11-05T10:00:00Z', logos: [] })).toBe('2026-11-05T10:00:00Z');
  });
});
