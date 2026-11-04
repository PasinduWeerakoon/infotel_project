/**
 * Winners: worked out when a session ends from the counted scans (provisional, and flagged on the
 * participants), then confirmed or disqualified by staff.
 * Disqualifying a player recalculates the list, so everyone below moves up one rank.
 * Confirmed winners keep their place.
 */
import { listSessionsByDate, markFinalized, nearbySessions } from '../data/hunt-repo.js';
import {
  dayWinners,
  listParticipants,
  listWinners,
  rememberDayWinner,
  saveWinners,
  setDisqualified,
} from '../data/players-repo.js';
import { huntStatus, pickWinners, prizeForRank } from '../domain/rules.js';
import type { HuntSession, Winner } from '../domain/types.js';
import { HttpError } from '../lib/http.js';
import { logger } from '../lib/logger.js';

/** Recalculates the winners of an ended session from the frozen standings. */
export async function recalculateWinners(session: HuntSession): Promise<Winner[]> {
  const [participants, previous, sameDayWinners] = await Promise.all([
    listParticipants(session.sessionId),
    listWinners(session.sessionId),
    session.allowPreviousWinners ? Promise.resolve(new Map<string, string>()) : dayWinners(session.date),
  ]);
  // Winners of other sessions that day are excluded. Winners of this session are not.
  const exclude = new Set(
    [...sameDayWinners].filter(([, sessionId]) => sessionId !== session.sessionId).map(([u]) => u),
  );
  const confirmed = new Map(previous.filter((w) => w.status === 'confirmed').map((w) => [w.userId, w]));

  const picked = pickWinners({ ranked: participants, count: session.winnersCount, excludeUserIds: exclude });
  const winners: Winner[] = picked.map((p, index) => {
    const rank = index + 1;
    const kept = confirmed.get(p.userId);
    return {
      sessionId: session.sessionId,
      rank,
      userId: p.userId,
      playerNumber: p.playerNumber,
      fullName: p.fullName,
      points: p.points,
      stalls: p.stalls,
      reachedAt: p.reachedAt,
      prizeName: prizeForRank(session.prizes, rank),
      status: kept ? 'confirmed' : 'provisional',
      confirmedBy: kept?.confirmedBy ?? null,
      collectedAt: kept?.collectedAt ?? null,
      collectedBy: kept?.collectedBy ?? null,
    };
  });
  await saveWinners(session.sessionId, winners, previous);
  return winners;
}

/**
 * Job: freezes the standings of ended sessions and lists their provisional winners, once per
 * session. Scans that arrive after this no longer count (sessionForScan skips finalized sessions).
 */
export async function finalizeEndedSessions(): Promise<void> {
  for (const session of await nearbySessions()) {
    if (session.finalized || huntStatus(session) !== 'closed') continue;
    if (!(await markFinalized(session.sessionId))) continue;
    const winners = await recalculateWinners(session);
    logger.info('Session finalized', { sessionId: session.sessionId, winners: winners.length });
  }
}

export async function confirmWinner(session: HuntSession, rank: number, by: string): Promise<Winner> {
  const winner = (await listWinners(session.sessionId)).find((w) => w.rank === rank);
  if (!winner) throw new HttpError(404, 'WINNER_NOT_FOUND', 'No winner at this rank');
  const confirmed: Winner = { ...winner, status: 'confirmed', confirmedBy: by };
  await saveWinners(session.sessionId, [confirmed], []);
  await rememberDayWinner(session.date, winner.userId, session.sessionId);
  return confirmed;
}

export async function disqualifyWinner(session: HuntSession, rank: number): Promise<Winner[]> {
  const winner = (await listWinners(session.sessionId)).find((w) => w.rank === rank);
  if (!winner) throw new HttpError(404, 'WINNER_NOT_FOUND', 'No winner at this rank');
  if (winner.collectedAt) throw new HttpError(409, 'ALREADY_COLLECTED', 'This prize was already collected');
  await setDisqualified(session.sessionId, winner.userId, true);
  return recalculateWinners(session);
}

/** Every confirmed winner of the day, for the prize desk search by player number. */
export async function winnersOfDay(date: string): Promise<Winner[]> {
  const sessions = await listSessionsByDate(date);
  return (await Promise.all(sessions.map((s) => listWinners(s.sessionId)))).flat();
}
