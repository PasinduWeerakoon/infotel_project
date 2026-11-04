/**
 * What the leaderboard screen and phones see: player numbers and points only, never names or
 * QuickLook user IDs. Everything comes from the scans QuickLook sent.
 */
import { nearbySessions } from '../data/hunt-repo.js';
import { listEventLogos } from '../data/logos-repo.js';
import { getStats, listWinners, playerCount, topParticipants } from '../data/players-repo.js';
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

export async function leaderboard(sessionId: string | undefined, top = 10) {
  const key = `${sessionId ?? 'current'}|${top}`;
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
  };

  if (session) {
    // Read a few extra in case some of the top players were disqualified
    const ranked = (await topParticipants(session.sessionId, top + 10))
      .filter((p) => !p.disqualified)
      .slice(0, top);
    const [stats, players, logos] = await Promise.all([
      getStats(session.sessionId),
      playerCount(session.sessionId),
      listEventLogos(),
    ]);
    const winners = session.finalized
      ? (await listWinners(session.sessionId)).filter((w) => w.status === 'confirmed')
      : [];
    body = {
      serverTime: nowIso(),
      session: brief(session),
      nextSession: brief(nextHuntSession(sessions)),
      players,
      stalls: logos.length,
      updatedAt: stats.lastScanAt,
      top: ranked.map((p, i) => ({
        rank: i + 1,
        playerNumber: p.playerNumber,
        points: p.points,
        stalls: p.stalls,
        reachedAt: p.reachedAt,
      })),
      winners: winners.map((w) => ({
        rank: w.rank,
        playerNumber: w.playerNumber,
        points: w.points,
        prizeName: w.prizeName,
      })),
    };
  }
  leaderboardCache.set(key, { at: Date.now(), body });
  return body;
}
