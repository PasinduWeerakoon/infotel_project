/**
 * Stall screen connections and background jobs.
 *
 * Screens connect with their screen key, then receive `screen.state`, `entry.started`,
 * `play.result` and `entry.ended`. When the result animation ends, the screen sends
 * `animation.finished` and the lock is released for the next visitor.
 */
import { getSettings } from '../data/catalog-repo.js';
import { expireEntry, getEntry, listLocks, releaseLock } from '../data/entries-repo.js';
import {
  type Screen,
  addConnection,
  findScreenByKey,
  getScreen,
  removeConnection,
  screenIdForConnection,
  touchScreen,
} from '../data/screens-repo.js';
import {
  listAllocations,
  listSessionsByDate,
  markRolledOver,
  setAllocated,
  upcomingSessions,
  withAllocationLock,
} from '../data/sessions-repo.js';
import { currentSession, nextSession, sessionStatus } from '../domain/sessions.js';
import type { Game, Session } from '../domain/types.js';
import { logger } from '../lib/logger.js';
import { colomboDate, ms, nowIso } from '../lib/time.js';
import { notifyScreens, sendToConnection } from './screen-notifier.js';

const brief = (s: { sessionId: string; name: string; startsAt: string; endsAt: string } | undefined) =>
  s ? { sessionId: s.sessionId, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt } : null;

/**
 * What a screen should show right now. A stall screen follows one game; a main display follows
 * several (game is then null) and is open while any of its games is open.
 */
export async function screenState(screen: Screen) {
  const game: Game | null = screen.games.length === 1 ? (screen.games[0] ?? null) : null;
  const [sessions, settings, locks] = await Promise.all([upcomingSessions(), getSettings(), listLocks()]);
  const open = screen.games.filter((g) => !settings.paused[g] && currentSession(sessions, g));
  const session = open[0] ? currentSession(sessions, open[0]) : undefined;
  const lock = locks.find(
    (l) => (l.lockKey === screen.screenId || screen.games.includes(l.game)) && ms(l.expiresAt) > Date.now(),
  );
  const state: 'idle' | 'busy' | 'closed' = !session ? 'closed' : lock ? 'busy' : 'idle';
  const next = screen.games
    .map((g) => nextSession(sessions, g))
    .filter((s) => s !== undefined)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return {
    type: 'screen.state' as const,
    state,
    game,
    session: brief(session),
    nextSession: brief(next),
  };
}

/** $connect: returns false for an unknown key, which rejects the connection. */
export async function connectScreen(screenKey: string | undefined, connectionId: string): Promise<boolean> {
  const screen = screenKey ? await findScreenByKey(screenKey) : undefined;
  if (!screen) return false;
  await addConnection(screen.screenId, connectionId, nowIso());
  logger.info('Screen connected', { screenId: screen.screenId });
  return true;
}

export async function disconnectScreen(connectionId: string): Promise<void> {
  await removeConnection(connectionId);
}

/** Messages from a screen: `screen.hello`, `animation.finished`, `ping`. */
export async function handleScreenMessage(connectionId: string, body: string): Promise<void> {
  const screenId = await screenIdForConnection(connectionId);
  const screen = screenId ? await getScreen(screenId) : undefined;
  if (!screen) return;

  let message: { type?: string; entryId?: string } = {};
  try {
    message = JSON.parse(body);
  } catch {
    return;
  }

  // Any screen showing the game may free it (the stall screen or the main display, whichever ends first)
  if (message.type === 'animation.finished' && message.entryId) {
    const entry = await getEntry(message.entryId);
    if (entry && screen.games.includes(entry.game)) await releaseLock(entry.lockKey, entry.entryId);
  }
  if (message.type === 'screen.hello' || message.type === 'animation.finished' || message.type === 'ping') {
    await touchScreen(screen.screenId, nowIso());
    await sendToConnection(connectionId, screen.screenId, await screenState(screen));
  }
}

/**
 * Runs every minute:
 * - entries not played within the lock timeout expire, the visitor's play is freed, the screen is told
 * - with the roll-over setting, unused prizes of ended sessions move to the next session that day
 */
export async function runJobs(): Promise<void> {
  const now = Date.now();
  for (const lock of await listLocks()) {
    if (ms(lock.expiresAt) > now) continue;
    const entry = await getEntry(lock.entryId);
    if (entry?.status === 'ready') {
      await expireEntry(entry);
      logger.info('Entry expired', { entryId: entry.entryId });
    } else {
      await releaseLock(lock.lockKey, lock.entryId);
    }
    await notifyScreens(lock.game, { type: 'entry.ended', entryId: lock.entryId });
  }

  const settings = await getSettings();
  if (settings.unusedPrizes === 'roll-over') await rollOverEndedSessions();
}

async function rollOverEndedSessions(): Promise<void> {
  const sessions = (await listSessionsByDate(colomboDate())).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  for (const session of sessions) {
    if (sessionStatus(session) !== 'closed' || session.rolledOver) continue;
    // Admin allocation saves wait while the prizes move, so neither overwrites the other.
    // If the lock is busy, the session stays unmarked and the next run (a minute later) tries again.
    const moved = await withAllocationLock(async () => {
      if (!(await markRolledOver(session.sessionId))) return false; // another job run took it
      await rollOverSession(session, sessions);
      return true;
    });
    if (moved?.result) await notifyScreens(null, { type: 'refresh' });
  }
}

async function rollOverSession(session: Session, sessions: Session[]): Promise<void> {
  for (const allocation of await listAllocations(session.sessionId)) {
    if (allocation.remaining <= 0) continue;
    const later = sessions.filter((s) => s.startsAt >= session.endsAt && s.games.includes(allocation.game));
    const target = later.find((s) => sessionStatus(s) !== 'closed');
    if (!target) continue;
    const targetRows = await listAllocations(target.sessionId, allocation.game);
    const current = targetRows.find((r) => r.prizeId === allocation.prizeId);
    // Close the ended session's unused units first, then add them to the next session
    await setAllocated({ ...allocation, allocated: allocation.given });
    await setAllocated({
      sessionId: target.sessionId,
      game: allocation.game,
      prizeId: allocation.prizeId,
      allocated: (current?.allocated ?? 0) + allocation.remaining,
      given: current?.given ?? 0,
    });
    logger.info('Prizes rolled over', {
      from: session.sessionId,
      to: target.sessionId,
      prizeId: allocation.prizeId,
      quantity: allocation.remaining,
    });
  }
}
