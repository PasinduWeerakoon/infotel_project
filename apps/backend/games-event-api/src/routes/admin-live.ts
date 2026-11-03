/**
 * Admin: live view, stall screens, prize desk and reports (prefix /admin/v1/games).
 *
 *   GET    /live
 *   GET    /screens                       POST /screens  { name, games } (key shown once)
 *   POST   /screens/:screenId/rotate-key  DELETE /screens/:screenId
 *   POST   /screens/:screenId/release-lock
 *   GET    /references?q=                 (reference ID or player name)
 *   GET    /references/:reference         POST /references/:reference/collect
 *   GET    /reports/plays?sessionId=&format=csv
 */
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { z } from 'zod';
import { getSecrets, imageUrl } from '../config.js';
import { getSettings, listPrizes } from '../data/catalog-repo.js';
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
import {
  type Screen,
  deleteScreen,
  getScreen,
  hashKey,
  listConnections,
  listScreens,
  saveScreen,
} from '../data/screens-repo.js';
import { getSession, listAllSessions, listAllocations, upcomingSessions } from '../data/sessions-repo.js';
import { normalizeReference } from '../domain/reference.js';
import { currentSession, nextSession } from '../domain/sessions.js';
import { GAMES, type Game } from '../domain/types.js';
import { type AdminRole, requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { ms, nowIso } from '../lib/time.js';
import { notifyScreens } from '../services/screen-notifier.js';

const BASE = '/admin/v1/games';
const READERS: AdminRole[] = ['games-admin', 'viewer', 'prize-desk'];
const WRITERS: AdminRole[] = ['games-admin'];
const DESK: AdminRole[] = ['games-admin', 'prize-desk'];

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
        const lock = locks.find((l) => l.lockKey === s.screenId && ms(l.expiresAt) > now);
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

const screenInput = z.object({
  name: z.string().min(1).max(60),
  games: z.array(z.enum(GAMES as [Game, ...Game[]])).min(1),
});

const newScreenKey = () => `scr_${randomBytes(24).toString('base64url')}`;

async function listAllScreens(req: ApiRequest) {
  await admin(req, READERS);
  return json({ items: await Promise.all((await listScreens()).map(publicScreen)) });
}

async function createScreen(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const input = parseBody(screenInput, req);
  const screenKey = newScreenKey();
  const screen: Screen = {
    screenId: `scr_${ulid().slice(-10).toLowerCase()}`,
    ...input,
    keyHash: hashKey(screenKey),
    lastSeenAt: null,
    createdAt: nowIso(),
  };
  await saveScreen(screen);
  audit('games.screen.created', actor.username, { screenId: screen.screenId });
  // The key is returned once. Only its hash is stored.
  return json({ screen: await publicScreen(screen), screenKey }, 201);
}

async function loadScreen(screenId: string | undefined): Promise<Screen> {
  const screen = screenId ? await getScreen(screenId) : undefined;
  if (!screen) throw new HttpError(404, 'SCREEN_NOT_FOUND', 'Screen not found');
  return screen;
}

async function rotateKey(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const screen = await loadScreen(req.params.screenId);
  const screenKey = newScreenKey();
  await saveScreen({ ...screen, keyHash: hashKey(screenKey) }, screen.keyHash);
  audit('games.screen.key-rotated', actor.username, { screenId: screen.screenId });
  return json({ screen: await publicScreen(screen), screenKey });
}

async function removeScreen(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const screen = await loadScreen(req.params.screenId);
  await deleteScreen(screen);
  audit('games.screen.deleted', actor.username, { screenId: screen.screenId });
  return noContent();
}

/** Frees a stuck screen. An unplayed entry holding it expires, so that visitor can scan again. */
async function releaseLock(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const screen = await loadScreen(req.params.screenId);
  const lock = (await listLocks()).find((l) => l.lockKey === screen.screenId);
  if (lock) {
    const entry = await getEntry(lock.entryId);
    if (entry) await expireEntry({ ...entry, lockKey: screen.screenId });
    await notifyScreens(lock.game, { type: 'entry.ended', entryId: lock.entryId });
  }
  audit('games.screen.lock-released', actor.username, { screenId: screen.screenId, entryId: lock?.entryId });
  return json({ released: Boolean(lock) });
}

async function referenceView(input: string | undefined) {
  const reference = normalizeReference(input ?? '');
  const found = reference ? await getReference(reference) : undefined;
  if (!found) throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'No prize found for this reference');
  const [prizes, session] = await Promise.all([listPrizes(), getSession(found.sessionId)]);
  const prize = prizes.find((p) => p.prizeId === found.prizeId);
  return {
    ...found,
    prize: prize ? { prizeId: prize.prizeId, name: prize.name, imageUrl: imageUrl(prize.imageKey) } : null,
    session: session ? { sessionId: session.sessionId, name: session.name, date: session.date } : null,
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
    .filter((s) => ms(s.startsAt) <= Date.now())
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, SEARCH_SESSIONS);
  const wins = (await Promise.all(sessions.map((s) => listWins(s.sessionId))))
    .flat()
    .filter((e) => e.reference && e.player?.name.toLowerCase().includes(needle))
    .sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''))
    .slice(0, SEARCH_RESULTS);
  return json({ items: await Promise.all(wins.map((e) => referenceView(e.reference ?? ''))) });
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
  const done = await collectReference(view.reference, actor.username, nowIso());
  if (!done) throw new HttpError(409, 'ALREADY_COLLECTED', 'This prize was just collected');
  audit('games.prize.collected', actor.username, { reference: view.reference });
  return json(await referenceView(view.reference));
}

/** Plays of one session as JSON or CSV. Opaque QuickLook IDs only, no personal data. */
async function playsReport(req: ApiRequest) {
  await admin(req, ['games-admin', 'viewer']);
  const sessionId = z.string().min(1).parse(req.query.sessionId);
  const [plays, prizes] = await Promise.all([listPlays(sessionId, 10_000), listPrizes()]);
  const names = new Map(prizes.map((p) => [p.prizeId, p.name]));
  const rows = plays.map((e) => ({
    playedAt: e.playedAt,
    game: e.game,
    userId: e.userId,
    prize: e.prizeId ? (names.get(e.prizeId) ?? e.prizeId) : '',
    reference: e.reference ?? '',
  }));
  if (req.query.format !== 'csv') return json({ items: rows });
  const header = 'playedAt,game,userId,prize,reference';
  const csvCell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [header, ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n');
  return {
    status: 200,
    text: csv,
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="plays-${sessionId}.csv"`,
    },
  };
}

export const adminLiveRoutes: Route[] = [
  { method: 'GET', path: `${BASE}/live`, handler: live },
  { method: 'GET', path: `${BASE}/screens`, handler: listAllScreens },
  { method: 'POST', path: `${BASE}/screens`, handler: createScreen },
  { method: 'POST', path: `${BASE}/screens/:screenId/rotate-key`, handler: rotateKey },
  { method: 'DELETE', path: `${BASE}/screens/:screenId`, handler: removeScreen },
  { method: 'POST', path: `${BASE}/screens/:screenId/release-lock`, handler: releaseLock },
  { method: 'GET', path: `${BASE}/references`, handler: searchReferences },
  { method: 'GET', path: `${BASE}/references/:reference`, handler: findReference },
  { method: 'POST', path: `${BASE}/references/:reference/collect`, handler: collect },
  { method: 'GET', path: `${BASE}/reports/plays`, handler: playsReport },
];
