/**
 * Admin: sessions and prize allocation (prefix /admin/v1/games).
 *
 *   GET    /sessions?date=                     list (all sessions when no date)
 *   POST   /sessions                           create
 *   PUT    /sessions/:sessionId                update
 *   DELETE /sessions/:sessionId                only if nobody played
 *   POST   /sessions/:sessionId/open | close   staff override
 *   GET    /sessions/:sessionId/allocation
 *   PUT    /sessions/:sessionId/allocation     { rows: [{ game, prizeId, allocated }] }
 *   POST   /allocations/auto-split             preview, or save with apply: true
 */
import { ulid } from 'ulid';
import { z } from 'zod';
import { getSecrets, imageUrl } from '../config.js';
import { listPrizes } from '../data/catalog-repo.js';
import { countPlays, hasPlays } from '../data/entries-repo.js';
import {
  deleteSession,
  getSession,
  listAllAllocations,
  listAllSessions,
  listAllocations,
  listSessionsByDate,
  saveSession,
  setAllocated,
  setSessionOverride,
  withAllocationLock,
} from '../data/sessions-repo.js';
import { autoSplit, checkAllocation } from '../domain/allocation.js';
import {
  type OpenEarlyProblem,
  findOverlap,
  openEarlyProblem,
  sessionMinutes,
  sessionStatus,
} from '../domain/sessions.js';
import { GAMES, type Game, type Session } from '../domain/types.js';
import { type Admin, type AdminRole, requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { atColomboTime, colomboDate, nowIso } from '../lib/time.js';
import { assertNoActivePlay } from '../services/live-guards.js';
import { prizesWithTotals } from '../services/prize-totals.js';
import { notifyScreens } from '../services/screen-notifier.js';

const BASE = '/admin/v1/games';
const READERS: AdminRole[] = ['games-admin', 'viewer', 'prize-desk'];
const WRITERS: AdminRole[] = ['games-admin'];

const admin = async (req: ApiRequest, roles: AdminRole[]): Promise<Admin> =>
  requireAdmin(req, (await getSecrets()).adminSecret, roles);

const gameSchema = z.enum(GAMES as [Game, ...Game[]]);
/** A real calendar day (2026-02-30 and 2026-13-01 are refused) */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((d) => {
    const day = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === d;
  }, 'This date does not exist');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
const sessionInput = z
  .object({
    name: z.string().min(1).max(60),
    date: dateSchema,
    start: timeSchema,
    end: timeSchema,
    games: z.array(gameSchema).min(1),
  })
  .refine((s) => s.end > s.start, { message: 'The end time must be after the start time', path: ['end'] });

const withStatus = (s: Session) => ({ ...s, status: sessionStatus(s) });

async function listSessions(req: ApiRequest) {
  await admin(req, READERS);
  const date = req.query.date;
  const sessions = date ? await listSessionsByDate(date) : await listAllSessions();
  sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const items = await Promise.all(
    sessions.map(async (s) => ({ ...withStatus(s), plays: await countPlays(s.sessionId) })),
  );
  return json({ items });
}

/** Builds and validates a session from the form. Sessions on the same day must not overlap. */
async function buildSession(input: z.infer<typeof sessionInput>, existing?: Session): Promise<Session> {
  const session: Session = {
    sessionId:
      existing?.sessionId ?? `ses_${input.date.replaceAll('-', '')}_${ulid().slice(-6).toLowerCase()}`,
    name: input.name,
    date: input.date,
    startsAt: atColomboTime(input.date, input.start),
    endsAt: atColomboTime(input.date, input.end),
    games: input.games,
    override: existing?.override ?? null,
    openedAt: existing?.openedAt ?? null,
    rolledOver: existing?.rolledOver ?? false,
    createdAt: existing?.createdAt ?? nowIso(),
  };
  if (!existing || sessionStatus(existing) === 'scheduled') {
    if (new Date(session.endsAt).getTime() <= Date.now()) {
      throw new HttpError(
        422,
        'SESSION_IN_PAST',
        'This session would already be over. Choose a later date or time',
      );
    }
  }
  const clash = findOverlap(session, await listSessionsByDate(input.date));
  if (clash) {
    throw new HttpError(
      409,
      'SESSION_OVERLAP',
      `Overlaps ${clash.name}. Sessions on the same day cannot overlap`,
      {
        sessionId: clash.sessionId,
      },
    );
  }
  return session;
}

async function createSession(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const session = await buildSession(parseBody(sessionInput, req));
  await saveSession(session);
  audit('games.session.created', actor.username, { sessionId: session.sessionId });
  return json(withStatus(session), 201);
}

async function loadSession(sessionId: string | undefined): Promise<Session> {
  const session = sessionId ? await getSession(sessionId) : undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found');
  return session;
}

async function updateSession(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const existing = await loadSession(req.params.sessionId);
  const input = parseBody(sessionInput, req);
  if (sessionStatus(existing) !== 'scheduled' && input.date !== existing.date) {
    throw new HttpError(409, 'SESSION_STARTED', 'A session that has started cannot move to another day');
  }
  const session = await buildSession(input, existing);
  const removed = existing.games.filter((g) => !session.games.includes(g));
  const stranded = (await listAllocations(existing.sessionId)).filter(
    (a) => removed.includes(a.game) && (a.allocated > 0 || a.given > 0),
  );
  if (stranded.length > 0) {
    throw new HttpError(
      409,
      'GAME_HAS_PRIZES',
      'Set the prizes of the removed game to 0 in Allocation before removing it from the session',
    );
  }
  if (sessionStatus(existing) === 'open' && sessionStatus(session) !== 'open') {
    await assertNoActivePlay(existing.games, 'close the session');
  }
  await saveSession(session);
  await notifyScreens(null, { type: 'refresh' });
  audit('games.session.updated', actor.username, { sessionId: session.sessionId });
  return json(withStatus(session));
}

async function removeSession(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const session = await loadSession(req.params.sessionId);
  if (await hasPlays(session.sessionId)) {
    throw new HttpError(
      409,
      'SESSION_HAS_PLAYS',
      'This session has plays and cannot be deleted. Close it instead',
    );
  }
  await deleteSession(session.sessionId);
  audit('games.session.deleted', actor.username, { sessionId: session.sessionId });
  return noContent();
}

const OPEN_EARLY_MESSAGES: Record<OpenEarlyProblem, string> = {
  NOT_TODAY: "Only today's sessions can be opened",
  ALREADY_ENDED: 'This session has already ended',
  ANOTHER_SESSION_OPEN: 'Another session is running. Close it before opening this one',
  NOT_NEXT_SESSION: 'An earlier session is still waiting to start. Open that one first',
};

const override = (value: 'open' | 'closed') => async (req: ApiRequest) => {
  const actor = await admin(req, WRITERS);
  const session = await loadSession(req.params.sessionId);
  if (value === 'open') {
    const problem = openEarlyProblem(session, await listSessionsByDate(colomboDate()), colomboDate());
    if (problem) throw new HttpError(409, problem, OPEN_EARLY_MESSAGES[problem]);
  } else if (sessionStatus(session) === 'open') {
    await assertNoActivePlay(session.games, 'close the session');
  }
  await setSessionOverride(session.sessionId, value);
  await notifyScreens(null, { type: 'refresh' });
  audit(`games.session.${value === 'open' ? 'opened' : 'closed'}`, actor.username, {
    sessionId: session.sessionId,
  });
  return json(withStatus({ ...session, override: value }));
};

async function getAllocation(req: ApiRequest) {
  await admin(req, READERS);
  const session = await loadSession(req.params.sessionId);
  const [rows, prizes] = await Promise.all([listAllocations(session.sessionId), prizesWithTotals()]);
  return json({ session: withStatus(session), prizes, rows });
}

interface AllocationChange {
  sessionId: string;
  game: Game;
  prizeId: string;
  allocated: number;
}

/** Validates against stock and already-given quantities, then saves every changed cell. */
async function applyAllocation(changes: AllocationChange[]) {
  const [existing, prizes] = await Promise.all([listAllAllocations(), listPrizes()]);
  const known = new Set(prizes.map((p) => p.prizeId));
  const unknown = changes.find((c) => !known.has(c.prizeId));
  if (unknown) throw new HttpError(422, 'PRIZE_NOT_FOUND', `Unknown prize ${unknown.prizeId}`);

  const sessionGames = new Map<string, Game[]>();
  for (const sessionId of new Set(changes.map((c) => c.sessionId))) {
    sessionGames.set(sessionId, (await getSession(sessionId))?.games ?? []);
  }
  const notRunning = changes.find((c) => c.allocated > 0 && !sessionGames.get(c.sessionId)?.includes(c.game));
  if (notRunning) {
    throw new HttpError(
      422,
      'GAME_NOT_IN_SESSION',
      'This session does not run that game, so it cannot get its prizes',
    );
  }

  const keyOf = (r: { sessionId: string; game: Game }) => `${r.sessionId}|${r.game}`;
  const given = new Map(existing.map((a) => [`${a.prizeId}|${keyOf(a)}`, a.given]));
  const rows = changes.map((c) => ({
    ...c,
    key: keyOf(c),
    given: given.get(`${c.prizeId}|${keyOf(c)}`) ?? 0,
  }));
  const problems = checkAllocation({
    changes: rows,
    existing: existing.map((a) => ({ prizeId: a.prizeId, key: keyOf(a), allocated: a.allocated })),
    stock: Object.fromEntries(prizes.map((p) => [p.prizeId, { name: p.name, stock: p.stock }])),
  });
  if (problems.length > 0) {
    throw new HttpError(409, 'ALLOCATION_INVALID', problems.map((p) => p.message).join('. '), { problems });
  }
  for (const row of rows) await setAllocated(row);
}

/** One save at a time, each checked against the latest saved quantities. */
async function applyAllocationSafely(changes: AllocationChange[]) {
  const done = await withAllocationLock(() => applyAllocation(changes));
  if (!done) {
    throw new HttpError(409, 'ALLOCATION_BUSY', 'Someone else is saving prize allocations. Please try again');
  }
}

async function putAllocation(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const session = await loadSession(req.params.sessionId);
  const { rows } = parseBody(
    z.object({
      rows: z.array(
        z.object({ game: gameSchema, prizeId: z.string(), allocated: z.number().int().min(0).max(100_000) }),
      ),
    }),
    req,
  );
  await applyAllocationSafely(rows.map((r) => ({ ...r, sessionId: session.sessionId })));
  audit('games.allocation.saved', actor.username, { sessionId: session.sessionId, cells: rows.length });
  return json({ rows: await listAllocations(session.sessionId) });
}

async function autoSplitRoute(req: ApiRequest) {
  const input = parseBody(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      game: gameSchema,
      totals: z.record(z.string(), z.number().int().min(0)),
      method: z.enum(['length', 'equal', 'custom']).default('length'),
      weights: z.record(z.string(), z.number().min(0)).optional(),
      apply: z.boolean().default(false),
    }),
    req,
  );
  const actor = await admin(req, input.apply ? WRITERS : READERS);
  // Sessions that have ended are left out: their prizes can no longer be won
  const sessions = (await listSessionsByDate(input.date))
    .filter((s) => s.games.includes(input.game) && sessionStatus(s) !== 'closed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (sessions.length === 0)
    throw new HttpError(
      422,
      'NO_SESSIONS',
      'There are no running or upcoming sessions for this game on this day',
    );

  const weights = Object.fromEntries(
    sessions.map((s) => {
      if (input.method === 'equal') return [s.sessionId, 1];
      if (input.method === 'custom') return [s.sessionId, input.weights?.[s.sessionId] ?? 0];
      return [s.sessionId, sessionMinutes(s)];
    }),
  );
  const split = autoSplit(input.totals, weights);

  if (input.apply) {
    const changes = Object.entries(split).flatMap(([prizeId, perSession]) =>
      Object.entries(perSession).map(([sessionId, allocated]) => ({
        sessionId,
        game: input.game,
        prizeId,
        allocated,
      })),
    );
    await applyAllocationSafely(changes);
    audit('games.allocation.auto-split', actor.username, {
      date: input.date,
      game: input.game,
      method: input.method,
    });
  }
  return json({
    sessions: sessions.map((s) => ({ sessionId: s.sessionId, name: s.name, weight: weights[s.sessionId] })),
    split,
    applied: input.apply,
  });
}

export const adminSessionRoutes: Route[] = [
  { method: 'GET', path: `${BASE}/sessions`, handler: listSessions },
  { method: 'POST', path: `${BASE}/sessions`, handler: createSession },
  { method: 'PUT', path: `${BASE}/sessions/:sessionId`, handler: updateSession },
  { method: 'DELETE', path: `${BASE}/sessions/:sessionId`, handler: removeSession },
  { method: 'POST', path: `${BASE}/sessions/:sessionId/open`, handler: override('open') },
  { method: 'POST', path: `${BASE}/sessions/:sessionId/close`, handler: override('closed') },
  { method: 'GET', path: `${BASE}/sessions/:sessionId/allocation`, handler: getAllocation },
  { method: 'PUT', path: `${BASE}/sessions/:sessionId/allocation`, handler: putAllocation },
  { method: 'POST', path: `${BASE}/allocations/auto-split`, handler: autoSplitRoute },
];
