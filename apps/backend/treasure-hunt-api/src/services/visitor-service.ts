/**
 * What visitors and the leaderboard screen see. Player numbers only on shared screens, never
 * names or phone numbers. Everything comes from the standings last read from QuickLook.
 */
import { nearbySessions } from '../data/hunt-repo.js';
import { getParticipant, getSyncStatus, listWinners, rankOf, topParticipants } from '../data/players-repo.js';
import { UNRANKED, huntStatus, nextHuntSession, sessionToShow } from '../domain/rules.js';
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

/** My progress in the session to show (current, or the latest ended one today). */
export async function myProgress(userId: string) {
  const sessions = await nearbySessions();
  const session = sessionToShow(sessions);
  const base = {
    serverTime: nowIso(),
    session: brief(session),
    nextSession: brief(nextHuntSession(sessions)),
  };
  if (!session) return { ...base, player: null, visits: [], winner: null };

  const [found, sync] = await Promise.all([
    getParticipant(session.sessionId, userId),
    getSyncStatus(session.sessionId),
  ]);
  const participant = found && found.rank !== UNRANKED ? found : undefined;
  const logos = new Map(session.logos.map((l) => [l.logoId, l]));
  const winner = session.finalized
    ? ((await listWinners(session.sessionId)).find((w) => w.userId === userId && w.status === 'confirmed') ??
      null)
    : null;

  return {
    ...base,
    player: participant
      ? {
          playerNumber: participant.playerNumber,
          points: participant.points,
          stalls: participant.stalls,
          rank: await rankOf(participant),
          players: sync?.participants ?? 0,
        }
      : null,
    visits: (participant?.logos ?? [])
      .filter((v) => logos.has(v.logoId))
      .sort((a, b) => a.firstScannedAt.localeCompare(b.firstScannedAt))
      .map((v) => ({
        logoId: v.logoId,
        name: logos.get(v.logoId)?.productName ?? '',
        company: logos.get(v.logoId)?.companyName ?? null,
        logoUrl: logos.get(v.logoId)?.logoUrl ?? null,
        scannedAt: v.firstScannedAt,
      })),
    totalStalls: session.logos.length,
    updatedAt: sync?.lastSyncAt ?? null,
    winner: winner
      ? {
          rank: winner.rank,
          prizeName: winner.prizeName,
          playerNumber: winner.playerNumber,
          collectedAt: winner.collectedAt,
        }
      : null,
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
      .filter((p) => !p.disqualified && p.rank !== UNRANKED)
      .slice(0, top);
    const sync = await getSyncStatus(session.sessionId);
    const winners = session.finalized
      ? (await listWinners(session.sessionId)).filter((w) => w.status === 'confirmed')
      : [];
    body = {
      serverTime: nowIso(),
      session: brief(session),
      nextSession: brief(nextHuntSession(sessions)),
      players: sync?.participants ?? 0,
      stalls: session.logos.length,
      updatedAt: sync?.lastSyncAt ?? null,
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
