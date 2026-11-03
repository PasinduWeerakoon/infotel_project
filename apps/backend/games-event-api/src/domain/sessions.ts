/**
 * Session rules: status from the clock (plus staff overrides), current and next session,
 * and the "no overlapping sessions on the same day" check.
 */
import type { ReleaseWindow } from './release-schedule.js';
import type { Game, Session, SessionStatus } from './types.js';

const t = (iso: string) => new Date(iso).getTime();

/**
 * Status at a given moment.
 * - Closed early by staff, or past the end time: closed
 * - Opened early by staff, or between start and end: open
 * - Otherwise: scheduled
 */
export function sessionStatus(session: Session, now: Date = new Date()): SessionStatus {
  const time = now.getTime();
  if (session.override === 'closed' || time >= t(session.endsAt)) return 'closed';
  if (session.override === 'open' || time >= t(session.startsAt)) return 'open';
  return 'scheduled';
}

/** The open session that includes the game, if any. */
export function currentSession(
  sessions: Session[],
  game?: Game,
  now: Date = new Date(),
): Session | undefined {
  return sessions.find((s) => sessionStatus(s, now) === 'open' && (!game || s.games.includes(game)));
}

/** The next scheduled session (optionally for one game), earliest first. */
export function nextSession(sessions: Session[], game?: Game, now: Date = new Date()): Session | undefined {
  return sessions
    .filter((s) => sessionStatus(s, now) === 'scheduled' && (!game || s.games.includes(game)))
    .sort((a, b) => t(a.startsAt) - t(b.startsAt))[0];
}

/** Two sessions overlap when one starts before the other ends. Touching ends (13:00 and 13:00) are allowed. */
export function overlaps(
  a: Pick<Session, 'startsAt' | 'endsAt'>,
  b: Pick<Session, 'startsAt' | 'endsAt'>,
): boolean {
  return t(a.startsAt) < t(b.endsAt) && t(b.startsAt) < t(a.endsAt);
}

/** Returns the first existing session that would overlap the candidate, ignoring the candidate itself. */
export function findOverlap(
  candidate: Pick<Session, 'sessionId' | 'startsAt' | 'endsAt'>,
  existing: Session[],
): Session | undefined {
  return existing.find((s) => s.sessionId !== candidate.sessionId && overlaps(candidate, s));
}

/**
 * The part of the session that winning moments are spread over. Play starts at the start time, or
 * earlier when staff opened the session early. The seed uses fields phones never see.
 */
export function releaseWindow(session: Session, game: Game): ReleaseWindow {
  const opened =
    session.override === 'open' && session.openedAt ? t(session.openedAt) : Number.POSITIVE_INFINITY;
  return {
    startMs: Math.min(t(session.startsAt), opened),
    endMs: t(session.endsAt),
    seed: `${session.sessionId}|${session.createdAt}|${game}`,
  };
}

/** Session length in minutes (the default weight for auto-split). */
export const sessionMinutes = (s: Pick<Session, 'startsAt' | 'endsAt'>): number =>
  Math.max(0, Math.round((t(s.endsAt) - t(s.startsAt)) / 60_000));

export type OpenEarlyProblem = 'NOT_TODAY' | 'ALREADY_ENDED' | 'ANOTHER_SESSION_OPEN' | 'NOT_NEXT_SESSION';

/**
 * Staff may open a session before its start time (or open it again after closing it early) only
 * when it is today's, has not reached its end time, no other session is running, and no other
 * session of today is scheduled before it. So two sessions are never open at the same time.
 */
export function openEarlyProblem(
  session: Session,
  sessionsToday: Session[],
  today: string,
  now: Date = new Date(),
): OpenEarlyProblem | null {
  if (session.date !== today) return 'NOT_TODAY';
  if (now.getTime() >= t(session.endsAt)) return 'ALREADY_ENDED';
  const others = sessionsToday.filter((s) => s.sessionId !== session.sessionId);
  if (others.some((s) => sessionStatus(s, now) === 'open')) return 'ANOTHER_SESSION_OPEN';
  const earlierWaiting = others.some(
    (s) => sessionStatus(s, now) === 'scheduled' && t(s.startsAt) < t(session.startsAt),
  );
  return earlierWaiting ? 'NOT_NEXT_SESSION' : null;
}
