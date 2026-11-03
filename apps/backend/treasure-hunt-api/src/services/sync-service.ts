/**
 * Reads the standings of hunt sessions from QuickLook's Leaderboard API and stores them.
 *
 * QuickLook counts the scans: only signed-in scans of the logos the admin selected for the
 * session, inside the session's period, and each logo once per visitor. We keep what we read
 * (one participant item per visitor, ranked by QuickLook) so the leaderboard, the visitor's own
 * progress and the winners all come from our table, even if QuickLook is briefly unreachable.
 */
import { nearbySessions } from '../data/hunt-repo.js';
import { listParticipants, nextPlayerNumber, saveParticipant, saveSyncStatus } from '../data/players-repo.js';
import { NOT_CONNECTED, exportStandings } from '../data/quicklook-leaderboard.js';
import { UNRANKED, huntStatus, pointsFor, scanPeriod } from '../domain/rules.js';
import type { HuntSession, Participant } from '../domain/types.js';
import { HttpError } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { nowIso } from '../lib/time.js';

/** Only a changed participant is written, so a quiet minute costs almost nothing */
const sameStanding = (a: Participant, b: Participant) =>
  a.rank === b.rank &&
  a.stalls === b.stalls &&
  a.points === b.points &&
  a.totalScans === b.totalScans &&
  a.reachedAt === b.reachedAt &&
  a.fullName === b.fullName;

/**
 * Reads one session from QuickLook and stores the result.
 * Returns false when nothing could be read (not connected, no logos, or QuickLook failed).
 */
export async function syncSession(session: HuntSession): Promise<boolean> {
  const status = { sessionId: session.sessionId, participants: 0, unknownLogoIds: [] as string[] };
  if (session.logos.length === 0) {
    await saveSyncStatus({ ...status, lastSyncAt: null, error: 'No logos selected for this session' });
    return false;
  }

  let standings: Awaited<ReturnType<typeof exportStandings>>;
  try {
    standings = await exportStandings({
      ...scanPeriod(session),
      logoIds: session.logos.map((l) => l.logoId),
    });
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Could not read the QuickLook leaderboard';
    if (error !== NOT_CONNECTED)
      logger.warn('Leaderboard read failed', { sessionId: session.sessionId, error });
    await saveSyncStatus({ ...status, lastSyncAt: null, error: message });
    return false;
  }

  const existing = new Map((await listParticipants(session.sessionId)).map((p) => [p.userId, p]));
  const seen = new Set<string>();
  for (const row of standings.rows) {
    seen.add(row.userId);
    const previous = existing.get(row.userId);
    const next: Participant = {
      sessionId: session.sessionId,
      userId: row.userId,
      playerNumber: previous?.playerNumber ?? (await nextPlayerNumber(session.sessionId)),
      fullName: row.fullName,
      mobile: row.mobile,
      rank: row.rank,
      stalls: row.stalls,
      points: pointsFor(row.stalls, session.pointsPerStall),
      totalScans: row.totalScans,
      reachedAt: row.reachedAt,
      logos: row.logos,
      disqualified: previous?.disqualified ?? false,
    };
    if (!previous || !sameStanding(previous, next)) await saveParticipant(next);
  }

  // Players QuickLook no longer lists (a logo was deselected, or they fell below the export limit)
  for (const previous of existing.values()) {
    if (seen.has(previous.userId) || previous.rank === UNRANKED) continue;
    await saveParticipant({ ...previous, rank: UNRANKED, stalls: 0, points: 0, logos: [] });
  }

  await saveSyncStatus({
    ...status,
    participants: standings.participants,
    unknownLogoIds: standings.unknownLogoIds,
    lastSyncAt: nowIso(),
    error: null,
  });
  return true;
}

/** Reads every hunt session that is running now. */
export async function syncOpenSessions(): Promise<void> {
  for (const session of await nearbySessions()) {
    if (huntStatus(session) !== 'open') continue;
    await syncSession(session).catch((error) =>
      logger.error('Sync failed', { sessionId: session.sessionId, error }),
    );
  }
}

/** True when a hunt session is running now (the job only reads QuickLook then) */
export async function anySessionOpen(): Promise<boolean> {
  return (await nearbySessions()).some((s) => huntStatus(s) === 'open');
}
