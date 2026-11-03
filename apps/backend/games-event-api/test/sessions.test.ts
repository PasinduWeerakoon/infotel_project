import { describe, expect, it } from 'vitest';
import { newReference, normalizeReference } from '../src/domain/reference.js';
import {
  currentSession,
  findOverlap,
  nextSession,
  openEarlyProblem,
  sessionStatus,
} from '../src/domain/sessions.js';
import type { Session } from '../src/domain/types.js';

const session = (id: string, start: string, end: string, extra: Partial<Session> = {}): Session => ({
  sessionId: id,
  name: id,
  date: '2026-11-02',
  startsAt: `2026-11-02T${start}:00+05:30`,
  endsAt: `2026-11-02T${end}:00+05:30`,
  games: ['spin', 'lucky-dip'],
  override: null,
  rolledOver: false,
  createdAt: '2026-10-27T10:00:00+05:30',
  ...extra,
});
const at = (time: string) => new Date(`2026-11-02T${time}:00+05:30`);

describe('session status', () => {
  const s1 = session('s1', '09:00', '13:00');

  it('follows the clock', () => {
    expect(sessionStatus(s1, at('08:59'))).toBe('scheduled');
    expect(sessionStatus(s1, at('09:00'))).toBe('open');
    expect(sessionStatus(s1, at('13:00'))).toBe('closed');
  });

  it('respects staff overrides', () => {
    expect(sessionStatus({ ...s1, override: 'open' }, at('08:30'))).toBe('open');
    expect(sessionStatus({ ...s1, override: 'closed' }, at('10:00'))).toBe('closed');
  });

  it('finds the current and next session per game', () => {
    const sessions = [s1, session('s2', '13:00', '17:00', { games: ['lucky-dip'] })];
    expect(currentSession(sessions, 'spin', at('10:00'))?.sessionId).toBe('s1');
    expect(currentSession(sessions, 'spin', at('14:00'))).toBeUndefined();
    expect(nextSession(sessions, 'lucky-dip', at('10:00'))?.sessionId).toBe('s2');
  });
});

describe('session overlap', () => {
  const existing = [session('s1', '09:00', '13:00')];

  it('allows sessions that only touch', () => {
    expect(findOverlap(session('s2', '13:00', '17:00'), existing)).toBeUndefined();
  });

  it('rejects overlapping sessions', () => {
    expect(findOverlap(session('s2', '12:00', '14:00'), existing)?.sessionId).toBe('s1');
  });

  it('ignores the session being edited', () => {
    expect(findOverlap(session('s1', '09:30', '12:00'), existing)).toBeUndefined();
  });
});

describe('references', () => {
  it('have the LKD-XXXX-XX format', () => {
    expect(newReference()).toMatch(/^LKD-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
  });

  it('accept what staff type', () => {
    expect(normalizeReference('lkd 7q4k 29')).toBe('LKD-7Q4K-29');
    expect(normalizeReference('7Q4K29')).toBe('LKD-7Q4K-29');
    expect(normalizeReference('LKD-0000-00')).toBeNull();
  });
});

describe('opening a session early', () => {
  const morning = session('morning', '09:00', '12:00');
  const noon = session('noon', '12:30', '14:00');
  const evening = session('evening', '15:00', '17:00');
  const today = [morning, noon, evening];

  it('allows the next session when nothing is running', () => {
    expect(openEarlyProblem(noon, today, '2026-11-02', at('12:10'))).toBeNull();
  });

  it('refuses while another session is running', () => {
    expect(openEarlyProblem(noon, today, '2026-11-02', at('11:00'))).toBe('ANOTHER_SESSION_OPEN');
    const opened = [morning, { ...noon, override: 'open' as const }, evening];
    expect(openEarlyProblem(evening, opened, '2026-11-02', at('12:10'))).toBe('ANOTHER_SESSION_OPEN');
  });

  it('refuses to skip a session that is still waiting', () => {
    expect(openEarlyProblem(evening, today, '2026-11-02', at('12:10'))).toBe('NOT_NEXT_SESSION');
  });

  it("refuses another day's session and one that has ended", () => {
    expect(openEarlyProblem(noon, today, '2026-11-01', at('12:10'))).toBe('NOT_TODAY');
    expect(openEarlyProblem(morning, today, '2026-11-02', at('12:10'))).toBe('ALREADY_ENDED');
  });

  it('allows a session closed early to open again', () => {
    const closed = { ...noon, override: 'closed' as const };
    expect(openEarlyProblem(closed, [morning, closed, evening], '2026-11-02', at('13:00'))).toBeNull();
  });
});
