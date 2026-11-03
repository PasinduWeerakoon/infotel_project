/**
 * Admin API of Project B (prefix /admin/v1/hunt).
 *
 *   GET    /sessions?date=                     POST /sessions
 *   PUT    /sessions/:sessionId                DELETE /sessions/:sessionId (before it starts)
 *   POST   /sessions/:sessionId/start | end
 *   PUT    /sessions/:sessionId/logos          the QuickLook logos that count in the session
 *   GET    /quicklook-logos?name=&company=&logoCode=&page=   search QuickLook's registered logos
 *   POST   /sessions/:sessionId/sync           read the standings from QuickLook now
 *   GET    /sessions/:sessionId/live           top 10, players, last read from QuickLook
 *   GET    /sessions/:sessionId/participants
 *   GET    /sessions/:sessionId/winners
 *   POST   /sessions/:sessionId/winners/:rank/confirm | disqualify | collect
 *   GET    /winners?date=                      prize desk: confirmed winners of a day
 */
import { ulid } from 'ulid';
import { z } from 'zod';
import { getSecrets } from '../config.js';
import {
  deleteSession,
  getSession,
  listAllSessions,
  listSessionsByDate,
  saveSession,
} from '../data/hunt-repo.js';
import {
  collectWinner,
  getSyncStatus,
  listParticipants,
  listWinners,
  topParticipants,
} from '../data/players-repo.js';
import { searchLogos } from '../data/quicklook-leaderboard.js';
import {
  type StartEarlyProblem,
  UNRANKED,
  huntStatus,
  overlaps,
  rankOrder,
  startEarlyProblem,
} from '../domain/rules.js';
import type { HuntSession } from '../domain/types.js';
import { type AdminRole, requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { atColomboTime, colomboDate, nowIso } from '../lib/time.js';
import { syncSession } from '../services/sync-service.js';
import {
  confirmWinner,
  disqualifyWinner,
  recalculateWinners,
  winnersOfDay,
} from '../services/winners-service.js';

const BASE = '/admin/v1/hunt';
const READERS: AdminRole[] = ['hunt-admin', 'viewer', 'prize-desk'];
const WRITERS: AdminRole[] = ['hunt-admin'];
const DESK: AdminRole[] = ['hunt-admin', 'prize-desk'];

const admin = async (req: ApiRequest, roles: AdminRole[]) =>
  requireAdmin(req, (await getSecrets()).adminSecret, roles);
const withStatus = (s: HuntSession) => ({ ...s, status: huntStatus(s) });

/** A real calendar day (2026-02-30 and 2026-13-01 are refused) */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((d) => {
    const day = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === d;
  }, 'This date does not exist');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
const logoSchema = z.object({
  logoId: z.string().min(1).max(64),
  productName: z.string().max(200),
  companyName: z.string().max(200).nullable(),
  logoCode: z.string().max(60).nullable(),
  logoUrl: z.string().max(500).nullable(),
});
const logosSchema = z
  .array(logoSchema)
  .max(100, 'QuickLook counts at most 100 logos per session')
  .refine((list) => new Set(list.map((l) => l.logoId)).size === list.length, 'A logo is selected twice');
const sessionInput = z
  .object({
    name: z.string().min(1).max(60),
    date: dateSchema,
    start: timeSchema,
    end: timeSchema,
    pointsPerStall: z.number().int().min(1).max(1000),
    winnersCount: z.number().int().min(1).max(50),
    prizes: z
      .array(z.object({ rank: z.number().int().min(1), prizeName: z.string().min(1).max(60) }))
      .max(50),
    allowPreviousWinners: z.boolean(),
    /** Only when creating: the logos to start with (for example copied from an earlier session) */
    logos: logosSchema.optional(),
  })
  .refine((s) => s.end > s.start, { message: 'The end time must be after the start time', path: ['end'] });

async function loadSession(sessionId: string | undefined): Promise<HuntSession> {
  const session = sessionId ? await getSession(sessionId) : undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found');
  return session;
}

async function buildSession(
  input: z.infer<typeof sessionInput>,
  existing?: HuntSession,
): Promise<HuntSession> {
  const session: HuntSession = {
    sessionId:
      existing?.sessionId ?? `hunt_${input.date.replaceAll('-', '')}_${ulid().slice(-6).toLowerCase()}`,
    name: input.name,
    date: input.date,
    startsAt: atColomboTime(input.date, input.start),
    endsAt: atColomboTime(input.date, input.end),
    override: existing?.override ?? null,
    openedAt: existing?.openedAt ?? null,
    closedAt: existing?.closedAt ?? null,
    pointsPerStall: input.pointsPerStall,
    winnersCount: input.winnersCount,
    prizes: input.prizes,
    allowPreviousWinners: input.allowPreviousWinners,
    logos: existing?.logos ?? input.logos ?? [],
    finalized: existing?.finalized ?? false,
    createdAt: existing?.createdAt ?? nowIso(),
  };
  if (!existing || huntStatus(existing) === 'scheduled') {
    if (new Date(session.endsAt).getTime() <= Date.now()) {
      throw new HttpError(
        422,
        'SESSION_IN_PAST',
        'This session would already be over. Choose a later date or time',
      );
    }
  }
  const clash = (await listSessionsByDate(input.date)).find(
    (s) => s.sessionId !== session.sessionId && overlaps(s, session),
  );
  if (clash)
    throw new HttpError(
      409,
      'SESSION_OVERLAP',
      `Overlaps ${clash.name}. Sessions on the same day cannot overlap`,
    );
  return session;
}

const routes: Route[] = [
  {
    method: 'GET',
    path: `${BASE}/sessions`,
    handler: async (req) => {
      await admin(req, READERS);
      const sessions = req.query.date ? await listSessionsByDate(req.query.date) : await listAllSessions();
      sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const items = await Promise.all(
        sessions.map(async (s) => {
          const sync = await getSyncStatus(s.sessionId);
          return { ...withStatus(s), players: sync?.participants ?? 0, sync: sync ?? null };
        }),
      );
      return json({ items });
    },
  },
  {
    method: 'POST',
    path: `${BASE}/sessions`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const session = await buildSession(parseBody(sessionInput, req));
      await saveSession(session);
      audit('hunt.session.created', actor.username, { sessionId: session.sessionId });
      return json(withStatus(session), 201);
    },
  },
  {
    method: 'PUT',
    path: `${BASE}/sessions/:sessionId`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const existing = await loadSession(req.params.sessionId);
      const session = await buildSession(parseBody(sessionInput, req), existing);
      await saveSession(session);
      if (session.finalized) await recalculateWinners(session); // prizes or winner count changed
      audit('hunt.session.updated', actor.username, { sessionId: session.sessionId });
      return json(withStatus(session));
    },
  },
  {
    method: 'DELETE',
    path: `${BASE}/sessions/:sessionId`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const session = await loadSession(req.params.sessionId);
      if (huntStatus(session) !== 'scheduled') {
        throw new HttpError(
          409,
          'SESSION_STARTED',
          'A session that has started cannot be deleted. End it instead',
        );
      }
      await deleteSession(session.sessionId);
      audit('hunt.session.deleted', actor.username, { sessionId: session.sessionId });
      return noContent();
    },
  },
  ...(['start', 'end'] as const).map(
    (action): Route => ({
      method: 'POST',
      path: `${BASE}/sessions/:sessionId/${action}`,
      handler: async (req) => {
        const actor = await admin(req, WRITERS);
        const session = await loadSession(req.params.sessionId);
        if (action === 'start') {
          const today = colomboDate();
          const problem = startEarlyProblem(session, await listSessionsByDate(today), today);
          if (problem) throw new HttpError(409, problem, START_EARLY_MESSAGES[problem]);
        }
        // The scan period sent to QuickLook follows these times, so they keep the milliseconds:
        // a scan in the last second before "End now" still counts
        const at = new Date().toISOString();
        const updated: HuntSession =
          action === 'start'
            ? { ...session, override: 'open', openedAt: at }
            : { ...session, override: 'closed', closedAt: at };
        await saveSession(updated);
        audit(`hunt.session.${action}`, actor.username, { sessionId: session.sessionId });
        return json(withStatus(updated));
      },
    }),
  ),
  {
    method: 'PUT',
    path: `${BASE}/sessions/:sessionId/logos`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const session = await loadSession(req.params.sessionId);
      if (session.finalized) {
        throw new HttpError(409, 'SESSION_FINALIZED', 'The winners of this session are already worked out');
      }
      const { logos } = parseBody(z.object({ logos: logosSchema }), req);
      const updated: HuntSession = { ...session, logos };
      await saveSession(updated);
      audit('hunt.session.logos', actor.username, { sessionId: session.sessionId, logos: logos.length });
      // A running session is read again at once, so the leaderboard follows the new selection
      if (huntStatus(updated) === 'open') await syncSession(updated);
      return json(withStatus(updated));
    },
  },
  {
    method: 'GET',
    path: `${BASE}/quicklook-logos`,
    handler: async (req) => {
      await admin(req, WRITERS);
      const query = z
        .object({
          name: z.string().max(100).optional(),
          company: z.string().max(100).optional(),
          logoCode: z.string().max(100).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);
      return json(await searchLogos(query));
    },
  },
  {
    method: 'POST',
    path: `${BASE}/sessions/:sessionId/sync`,
    handler: async (req) => {
      await admin(req, WRITERS);
      const session = await loadSession(req.params.sessionId);
      if (huntStatus(session) === 'scheduled') {
        throw new HttpError(409, 'SESSION_NOT_STARTED', 'The session has not started yet');
      }
      if (session.finalized) {
        throw new HttpError(409, 'SESSION_FINALIZED', 'The winners of this session are already worked out');
      }
      await syncSession(session);
      return json({ sync: await getSyncStatus(session.sessionId) });
    },
  },
  {
    method: 'GET',
    path: `${BASE}/sessions/:sessionId/live`,
    handler: async (req) => {
      await admin(req, READERS);
      const session = await loadSession(req.params.sessionId);
      const top = (await topParticipants(session.sessionId, 20))
        .filter((p) => !p.disqualified && p.rank !== UNRANKED)
        .slice(0, 10);
      const sync = await getSyncStatus(session.sessionId);
      return json({
        session: withStatus(session),
        players: sync?.participants ?? 0,
        sync: sync ?? null,
        top,
      });
    },
  },
  {
    method: 'GET',
    path: `${BASE}/sessions/:sessionId/participants`,
    handler: async (req) => {
      await admin(req, ['hunt-admin', 'viewer']);
      const session = await loadSession(req.params.sessionId);
      const items = (await listParticipants(session.sessionId))
        .filter((p) => p.rank !== UNRANKED)
        .sort(rankOrder);
      return json({ items });
    },
  },
  {
    method: 'GET',
    path: `${BASE}/sessions/:sessionId/winners`,
    handler: async (req) => {
      await admin(req, READERS);
      const session = await loadSession(req.params.sessionId);
      return json({ session: withStatus(session), items: await listWinners(session.sessionId) });
    },
  },
  {
    method: 'POST',
    path: `${BASE}/sessions/:sessionId/winners/:rank/confirm`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const session = await loadSession(req.params.sessionId);
      const winner = await confirmWinner(session, Number(req.params.rank), actor.username);
      audit('hunt.winner.confirmed', actor.username, { sessionId: session.sessionId, rank: winner.rank });
      return json(winner);
    },
  },
  {
    method: 'POST',
    path: `${BASE}/sessions/:sessionId/winners/:rank/disqualify`,
    handler: async (req) => {
      const actor = await admin(req, WRITERS);
      const session = await loadSession(req.params.sessionId);
      const items = await disqualifyWinner(session, Number(req.params.rank));
      audit('hunt.winner.disqualified', actor.username, {
        sessionId: session.sessionId,
        rank: req.params.rank,
      });
      return json({ items });
    },
  },
  {
    method: 'POST',
    path: `${BASE}/sessions/:sessionId/winners/:rank/collect`,
    handler: async (req) => {
      const actor = await admin(req, DESK);
      const session = await loadSession(req.params.sessionId);
      const rank = Number(req.params.rank);
      if (!(await collectWinner(session.sessionId, rank, actor.username, nowIso()))) {
        throw new HttpError(409, 'CANNOT_COLLECT', 'Already collected, or the winner is not confirmed yet');
      }
      audit('hunt.prize.collected', actor.username, { sessionId: session.sessionId, rank });
      return json((await listWinners(session.sessionId)).find((w) => w.rank === rank));
    },
  },
  {
    method: 'GET',
    path: `${BASE}/winners`,
    handler: async (req) => {
      await admin(req, DESK);
      const winners = await winnersOfDay(req.query.date ?? colomboDate());
      return json({ items: winners.filter((w) => w.status === 'confirmed') });
    },
  },
];

const START_EARLY_MESSAGES: Record<StartEarlyProblem, string> = {
  NOT_TODAY: "Only today's sessions can be started",
  ALREADY_ENDED: 'This session has already ended',
  ANOTHER_SESSION_OPEN: 'Another hunt session is running. End it before starting this one',
  NOT_NEXT_SESSION: 'An earlier session is still waiting to start. Start that one first',
};

export const adminRoutes = routes;
