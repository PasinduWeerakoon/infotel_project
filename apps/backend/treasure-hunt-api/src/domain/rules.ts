/**
 * Treasure Hunt rules as pure functions: session status, scan period, leaderboard order and winners.
 */
import type { HuntSession, Participant, RankPrize } from './types.js';

const t = (iso: string) => new Date(iso).getTime();

export type HuntStatus = 'scheduled' | 'open' | 'closed';

/** Closed early or past the end: closed. Started early or between start and end: open. */
export function huntStatus(session: HuntSession, at: Date = new Date()): HuntStatus {
  if (session.override === 'closed' || at.getTime() >= t(session.endsAt)) return 'closed';
  if (session.override === 'open' || at.getTime() >= t(session.startsAt)) return 'open';
  return 'scheduled';
}

/** The session that was open at a moment (used to score a scan by its scan time). */
export const sessionOpenAt = (sessions: HuntSession[], at: Date) =>
  sessions.find((s) => huntStatus(s, at) === 'open');

export function nextHuntSession(sessions: HuntSession[], at: Date = new Date()): HuntSession | undefined {
  return sessions
    .filter((s) => huntStatus(s, at) === 'scheduled')
    .sort((a, b) => t(a.startsAt) - t(b.startsAt))[0];
}

/** The session to show: the open one, otherwise the latest one that already ended today. */
export function sessionToShow(sessions: HuntSession[], at: Date = new Date()): HuntSession | undefined {
  return (
    sessionOpenAt(sessions, at) ??
    sessions.filter((s) => huntStatus(s, at) === 'closed').sort((a, b) => t(b.endsAt) - t(a.endsAt))[0]
  );
}

export const overlaps = (
  a: Pick<HuntSession, 'startsAt' | 'endsAt'>,
  b: Pick<HuntSession, 'startsAt' | 'endsAt'>,
) => t(a.startsAt) < t(b.endsAt) && t(b.startsAt) < t(a.endsAt);

/** Rank used for players QuickLook no longer lists (for example after a logo was deselected) */
export const UNRANKED = 999_999;

/**
 * Leaderboard sort key: QuickLook's rank, which already puts the most stalls first and breaks
 * ties by who reached that count first. Stored as GSI1SK, so DynamoDB returns the top N in order.
 */
export function leaderboardKey(rank: number): string {
  return String(Math.min(Math.max(rank, 1), UNRANKED)).padStart(6, '0');
}

/** Orders participants like the leaderboard index does. */
export function rankOrder(a: Participant, b: Participant): number {
  return a.rank - b.rank;
}

/** Points shown to visitors: one point value per different stall logo scanned */
export const pointsFor = (stalls: number, pointsPerStall: number) => stalls * pointsPerStall;

/**
 * The scan period sent to QuickLook: from the start (or when staff opened it early) to the end
 * (or when staff ended it early).
 */
export function scanPeriod(session: HuntSession): { start: string; end: string } {
  const start = session.override === 'open' && session.openedAt ? session.openedAt : session.startsAt;
  const end = session.override === 'closed' && session.closedAt ? session.closedAt : session.endsAt;
  return { start, end };
}

/**
 * Picks the winners: highest ranks first, skipping disqualified players and, when the session
 * does not allow it, players who already won earlier the same day.
 */
export function pickWinners(input: {
  ranked: Participant[];
  count: number;
  excludeUserIds: Set<string>;
}): Participant[] {
  return [...input.ranked]
    .sort(rankOrder)
    .filter((p) => !p.disqualified && p.stalls > 0 && !input.excludeUserIds.has(p.userId))
    .slice(0, input.count);
}

export const prizeForRank = (prizes: RankPrize[], rank: number): string | null =>
  prizes.find((p) => p.rank === rank)?.prizeName ?? null;

export type StartEarlyProblem = 'NOT_TODAY' | 'ALREADY_ENDED' | 'ANOTHER_SESSION_OPEN' | 'NOT_NEXT_SESSION';

/**
 * Staff may start a hunt session early only when it is today's, has not ended or been finalized,
 * no other hunt session is running, and no other session of today is waiting to start before it.
 */
export function startEarlyProblem(
  session: HuntSession,
  sessionsToday: HuntSession[],
  today: string,
  at: Date = new Date(),
): StartEarlyProblem | null {
  if (session.date !== today) return 'NOT_TODAY';
  if (session.finalized || at.getTime() >= t(session.endsAt)) return 'ALREADY_ENDED';
  const others = sessionsToday.filter((s) => s.sessionId !== session.sessionId);
  if (others.some((s) => huntStatus(s, at) === 'open')) return 'ANOTHER_SESSION_OPEN';
  const earlierWaiting = others.some(
    (s) => huntStatus(s, at) === 'scheduled' && t(s.startsAt) < t(session.startsAt),
  );
  return earlierWaiting ? 'NOT_NEXT_SESSION' : null;
}
