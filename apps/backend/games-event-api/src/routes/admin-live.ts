/**
 * Admin: live view, stall screens, prize desk and reports (prefix /admin/v1/games).
 *
 *   GET    /live
 *   GET    /screens                       (fixed: set up at deploy, their links never change)
 *   POST   /screens/:screenId/release-lock
 *   GET    /references?q=                 (reference ID or player name)
 *   GET    /references/:reference         POST /references/:reference/collect
 *   GET    /entries/:entryId/person       (every play in the event by the same person)
 *   POST   /entries/:entryId/reclaim      (the prize goes back to the session's pool)
 *   GET    /reports/plays?sessionId=&format=csv
 */
import { z } from 'zod';
import { getSecrets, imageUrl } from '../config.js';
import { getSettings, listPrizes } from '../data/catalog-repo.js';
import { voidPrize } from '../data/claims-repo.js';
import {
  collectReference,
  countPlays,
  expireEntry,
  getEntry,
  getReference,
  listLocks,
  listPlays,
  listWins,
} from '../data/entries-repo.js';
import { type Screen, getScreen, listConnections, listScreens } from '../data/screens-repo.js';
import { getSession, listAllSessions, listAllocations, upcomingSessions } from '../data/sessions-repo.js';
import { normalizeReference } from '../domain/reference.js';
import { currentSession, nextSession } from '../domain/sessions.js';
import { GAMES, type Game } from '../domain/types.js';
import { type AdminRole, requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { ms, nowIso } from '../lib/time.js';
import { type EventPlays, eventPlays, personPlays, playRows, toCsv } from '../services/plays-report.js';
import { notifyScreens } from '../services/screen-notifier.js';

const BASE = '/admin/v1/games';
const READERS: AdminRole[] = ['games-admin', 'viewer', 'prize-desk'];
const WRITERS: AdminRole[] = ['games-admin'];
const DESK: AdminRole[] = ['games-admin', 'prize-desk'];
/** Viewers see masked phones; prize desk staff and admins check the full number */
const fullPhoneFor = (role: AdminRole) => role !== 'viewer';

const admin = async (req: ApiRequest, roles: AdminRole[]) =>
  requireAdmin(req, (await getSecrets()).adminSecret, roles);

const publicScreen = async ({ keyHash: _hash, ...screen }: Screen) => ({
  ...screen,
  connections: (await listConnections(screen.screenId)).length,
});

async function live(req: ApiRequest) {
  await admin(req, READERS);
  const [sessions, settings, prizes, screens, locks] = await Promise.all([
    upcomingSessions(),
    getSettings(),
    listPrizes(),
    listScreens(),
    listLocks(),
  ]);
  const session = currentSession(sessions);
  const names = new Map(prizes.map((p) => [p.prizeId, p]));

  let games: Record<string, unknown> = {};
  let latestPlays: unknown[] = [];
  let plays = 0;
  if (session) {
    const allocations = await listAllocations(session.sessionId);
    games = Object.fromEntries(
      GAMES.map((game) => [
        game,
        {
          paused: settings.paused[game],
          inSession: session.games.includes(game),
          prizes: allocations
            .filter((a) => a.game === game)
            .map((a) => ({
              ...a,
              name: names.get(a.prizeId)?.name ?? a.prizeId,
              isMainPrize: names.get(a.prizeId)?.isMainPrize,
            })),
        },
      ]),
    );
    const recent = await listPlays(session.sessionId, 20);
    latestPlays = recent.map((e) => ({
      entryId: e.entryId,
      game: e.game,
      playedAt: e.playedAt,
      userId: e.userId,
      prizeName: e.prizeId ? (names.get(e.prizeId)?.name ?? e.prizeId) : null,
      reference: e.reference,
    }));
    plays = await countPlays(session.sessionId);
  }

  const now = Date.now();
  return json({
    serverTime: nowIso(),
    session: session ? { ...session, plays } : null,
    nextSession: nextSession(sessions) ?? null,
    games,
    screens: await Promise.all(
      screens.map(async (s) => {
        const lock = locks.find((l) => s.games.includes(l.game) && ms(l.expiresAt) > now);
        return {
          ...(await publicScreen(s)),
          state: lock ? 'playing' : 'idle',
          lockExpiresAt: lock?.expiresAt ?? null,
        };
      }),
    ),
    latestPlays,
  });
}

async function listAllScreens(req: ApiRequest) {
  await admin(req, READERS);
  return json({ items: await Promise.all((await listScreens()).map(publicScreen)) });
}

async function loadScreen(screenId: string | undefined): Promise<Screen> {
  const screen = screenId ? await getScreen(screenId) : undefined;
  if (!screen) throw new HttpError(404, 'SCREEN_NOT_FOUND', 'Screen not found');
  return screen;
}

/** Frees a stuck screen. An unplayed entry holding it expires, so that visitor can scan again. */
async function releaseLock(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const screen = await loadScreen(req.params.screenId);
  const lock = (await listLocks()).find((l) => screen.games.includes(l.game));
  if (lock) {
    const entry = await getEntry(lock.entryId);
    if (entry) await expireEntry({ ...entry, lockKey: lock.lockKey });
    await notifyScreens(lock.game, { type: 'entry.ended', entryId: lock.entryId });
  }
  audit('games.screen.lock-released', actor.username, { screenId: screen.screenId, entryId: lock?.entryId });
  return json({ released: Boolean(lock) });
}

/**
 * A prize as the desk sees it, with every other play in the event by the same person (shared
 * account, phone or name) so staff can refuse a second prize. `event` is read once per search.
 */
async function referenceView(input: string | undefined, event?: Promise<EventPlays>) {
  const reference = normalizeReference(input ?? '');
  const found = reference ? await getReference(reference) : undefined;
  if (!found) throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'No prize found for this reference');
  const [prizes, session, plays] = await Promise.all([
    listPrizes(),
    getSession(found.sessionId),
    event ? event.then((e) => personPlays(found.entryId, true, e)) : personPlays(found.entryId, true),
  ]);
  const prize = prizes.find((p) => p.prizeId === found.prizeId);
  return {
    ...found,
    prize: prize ? { prizeId: prize.prizeId, name: prize.name, imageUrl: imageUrl(prize.imageKey) } : null,
    session: session ? { sessionId: session.sessionId, name: session.name, date: session.date } : null,
    voided: found.voided?.reason ?? null,
    /** The winner gave no phone: shown as not verified, staff decide (it can still be collected) */
    phoneMissing: Boolean(found.player && !found.player.phone && !found.voided),
    /** Other plays in the event by the same person, oldest first */
    related: plays.filter((p) => p.entryId !== found.entryId),
  };
}

const SEARCH_SESSIONS = 30;
const SEARCH_RESULTS = 20;

/**
 * Prize desk search: a reference ID finds that prize, any other text finds prizes
 * whose player name contains it, newest first, in the latest sessions that have started.
 */
async function searchReferences(req: ApiRequest) {
  await admin(req, DESK);
  const q = z.string().trim().min(2).max(60).parse(req.query.q);
  const reference = normalizeReference(q);
  if (reference && (await getReference(reference))) return json({ items: [await referenceView(reference)] });

  const needle = q.toLowerCase();
  const sessions = (await listAllSessions())
    // Started by the clock, or opened early by staff
    .filter((s) => ms(s.startsAt) <= Date.now() || s.override === 'open')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, SEARCH_SESSIONS);
  const wins = (await Promise.all(sessions.map((s) => listWins(s.sessionId))))
    .flat()
    .filter((e) => e.reference && e.player?.name.toLowerCase().includes(needle))
    .sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''))
    .slice(0, SEARCH_RESULTS);
  const event = eventPlays();
  return json({ items: await Promise.all(wins.map((e) => referenceView(e.reference ?? '', event))) });
}

async function findReference(req: ApiRequest) {
  await admin(req, DESK);
  return json(await referenceView(req.params.reference));
}

async function collect(req: ApiRequest) {
  const actor = await admin(req, DESK);
  const view = await referenceView(req.params.reference);
  if (view.collectedAt) {
    throw new HttpError(
      409,
      'ALREADY_COLLECTED',
      `Already collected at ${view.collectedAt} by ${view.collectedBy}`,
      {
        collectedAt: view.collectedAt,
        collectedBy: view.collectedBy,
      },
    );
  }
  if (view.voided) {
    throw new HttpError(409, 'PRIZE_TAKEN_BACK', 'This prize was taken back and cannot be collected');
  }
  const done = await collectReference(view.reference, actor.username, nowIso());
  if (!done) throw new HttpError(409, 'ALREADY_COLLECTED', 'This prize was just collected');
  audit('games.prize.collected', actor.username, { reference: view.reference });
  return json(await referenceView(view.reference));
}

/** Every play in the event by the same person as this play (the Scans panel) */
async function person(req: ApiRequest) {
  const actor = await admin(req, READERS);
  const entryId = req.params.entryId ?? '';
  const items = await personPlays(entryId, fullPhoneFor(actor.role));
  if (!items.length) throw new HttpError(404, 'ENTRY_NOT_FOUND', 'Play not found');
  return json({ items });
}

/** Staff take a prize back from a duplicate play. It goes back to the session's pool. */
async function reclaim(req: ApiRequest) {
  const actor = await admin(req, DESK);
  const entry = await getEntry(req.params.entryId ?? '');
  if (!entry || entry.status !== 'played') throw new HttpError(404, 'ENTRY_NOT_FOUND', 'Play not found');
  if (entry.voided) throw new HttpError(409, 'PRIZE_TAKEN_BACK', 'This prize was already taken back');
  if (!entry.prizeId || !entry.reference) throw new HttpError(409, 'NO_PRIZE', 'This play has no prize');
  const reference = await getReference(entry.reference);
  if (reference?.collectedAt) {
    throw new HttpError(
      409,
      'ALREADY_COLLECTED',
      `Already collected at ${reference.collectedAt} by ${reference.collectedBy}`,
    );
  }
  const done = await voidPrize(entry, { reason: 'reclaimed', by: actor.username, at: nowIso() });
  if (!done) throw new HttpError(409, 'PLAY_CHANGED', 'This play just changed. Please refresh and try again');
  audit('games.prize.reclaimed', actor.username, { entryId: entry.entryId, reference: entry.reference });
  return json({ reclaimed: true });
}

/** Plays of one session as JSON (admin table) or CSV (export), with the masked phone */
async function playsReport(req: ApiRequest) {
  await admin(req, ['games-admin', 'viewer']);
  const sessionId = z.string().min(1).max(60).parse(req.query.sessionId);
  const rows = await playRows(sessionId);
  if (req.query.format !== 'csv') return json({ items: rows });
  return {
    status: 200,
    text: toCsv(rows),
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="plays-${sessionId.replace(/[^\w-]/g, '')}.csv"`,
    },
  };
}

export const adminLiveRoutes: Route[] = [
  { method: 'GET', path: `${BASE}/live`, handler: live },
  { method: 'GET', path: `${BASE}/screens`, handler: listAllScreens },
  { method: 'POST', path: `${BASE}/screens/:screenId/release-lock`, handler: releaseLock },
  { method: 'GET', path: `${BASE}/references`, handler: searchReferences },
  { method: 'GET', path: `${BASE}/references/:reference`, handler: findReference },
  { method: 'POST', path: `${BASE}/references/:reference/collect`, handler: collect },
  { method: 'GET', path: `${BASE}/entries/:entryId/person`, handler: person },
  { method: 'POST', path: `${BASE}/entries/:entryId/reclaim`, handler: reclaim },
  { method: 'GET', path: `${BASE}/reports/plays`, handler: playsReport },
];
