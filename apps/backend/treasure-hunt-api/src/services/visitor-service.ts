/**
 * What the leaderboard screen and phones see: player numbers and points only, never names or
 * QuickLook user IDs. Everything comes from the scans QuickLook sent.
 */
import { nearbySessions } from '../data/hunt-repo.js';
import {
  getStats,
  listWinners,
  playerCount,
  rankedParticipants,
  topParticipants,
} from '../data/players-repo.js';
import { huntStatus, nextHuntSession, sessionToShow } from '../domain/rules.js';
import type { HuntSession } from '../domain/types.js';
import { nowIso } from '../lib/time.js';

const brief = (s: HuntSession | undefined) =>
  s
    ? {
        sessionId: s.sessionId,
        name: s.name,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        state: huntStatus(s),
        finalized: s.finalized,
        pointsPerStall: s.pointsPerStall,
      }
    : null;

export async function getStatus() {
  const sessions = await nearbySessions();
  return {
    serverTime: nowIso(),
    session: brief(sessionToShow(sessions)),
    nextSession: brief(nextHuntSession(sessions)),
  };
}

// The leaderboard is read by screens and phones, so it is rebuilt at most every 3 seconds
const leaderboardCache = new Map<string, { at: number; body: unknown }>();

/** Players per page of the phone leaderboard */
export const PAGE_SIZE = 10;

/**
 * The top players (big screen), or with `page` one page of everyone (phone): ranks 1 to 10 on
 * page 1, 11 to 20 on page 2 and so on, with the number of pages.
 */
export async function leaderboard(sessionId: string | undefined, top = 10, page?: number) {
  const key = `${sessionId ?? 'current'}|${top}|${page ?? ''}`;
  const hit = leaderboardCache.get(key);
  if (hit && Date.now() - hit.at < 3000) return hit.body;

  const sessions = await nearbySessions();
  const session = sessionId ? sessions.find((s) => s.sessionId === sessionId) : sessionToShow(sessions);
  let body: unknown = {
    serverTime: nowIso(),
    session: null,
    nextSession: brief(nextHuntSession(sessions)),
    top: [],
    players: 0,
    ...(page ? { page, pages: 1 } : {}),
  };

  if (session) {
    const everyone = page ? await rankedParticipants(session.sessionId) : undefined;
    const offset = page ? (page - 1) * PAGE_SIZE : 0;
    // Top players: read a few extra in case some of them were disqualified
    const ranked = everyone
      ? everyone.slice(offset, offset + PAGE_SIZE)
      : (await topParticipants(session.sessionId, top + 10)).filter((p) => !p.disqualified).slice(0, top);
    const [stats, players] = await Promise.all([getStats(session.sessionId), playerCount(session.sessionId)]);
    const winners = session.finalized
      ? (await listWinners(session.sessionId)).filter((w) => w.status === 'confirmed')
      : [];
    body = {
      serverTime: nowIso(),
      session: brief(session),
      nextSession: brief(nextHuntSession(sessions)),
      players,
      scans: stats.scans,
      updatedAt: stats.lastScanAt,
      ...(everyone ? { page, pages: Math.max(1, Math.ceil(everyone.length / PAGE_SIZE)) } : {}),
      top: ranked.map((p, i) => ({
        rank: offset + i + 1,
        playerNumber: p.playerNumber,
        name: p.fullName.trim(),
        points: p.points,
        stalls: p.stalls,
        reachedAt: p.reachedAt,
      })),
      winners: winners.map((w) => ({
        rank: w.rank,
        playerNumber: w.playerNumber,
        name: w.fullName.trim(),
        points: w.points,
        prizeName: w.prizeName,
      })),
    };
  }
  leaderboardCache.set(key, { at: Date.now(), body });
  return body;
}
