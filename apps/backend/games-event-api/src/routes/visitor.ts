/**
 * Visitor API of Project A (signed-in QuickLook visitors).
 *
 *   GET  /games/v1/status
 *   POST /games/v1/entries                 { scanId }
 *   GET  /games/v1/entries/:entryId
 *   POST /games/v1/entries/:entryId/play   { player: { name, phone } } (needed for both games,
 *                                          the name is the QuickLook one when the session has it locked)
 */
import { z } from 'zod';
import { getSecrets } from '../config.js';
import { requireVisitor } from '../lib/auth.js';
import { type ApiRequest, type Route, json, parseBody } from '../lib/http.js';
import { LIMITS, rateLimit } from '../lib/rate-limit.js';
import { getStatus, playEntry, readEntry, startEntry } from '../services/play-service.js';

/** Name and phone are only trimmed and limited in length, never validated */
const playInput = z.object({
  player: z
    .object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().min(1).max(30) })
    .optional(),
});

/** The signed-in visitor, counted against the per-visitor and per-IP limits */
const visitor = async (req: ApiRequest) => {
  const signedIn = await requireVisitor(req, (await getSecrets()).sessionSecret);
  await Promise.all([
    rateLimit('visitor', signedIn.userId, LIMITS.perVisitor),
    rateLimit('games-ip', req.ip, LIMITS.perIp),
  ]);
  return signedIn;
};

export const visitorRoutes: Route[] = [
  {
    method: 'GET',
    path: '/games/v1/status',
    // The same for everyone, so CloudFront and browsers may reuse it for 5 seconds
    handler: async () => json(await getStatus(), 200, { headers: { 'cache-control': 'public, max-age=5' } }),
  },
  {
    method: 'POST',
    path: '/games/v1/entries',
    handler: async (req) => {
      const { userId } = await visitor(req);
      const { scanId } = parseBody(z.object({ scanId: z.string().min(1).max(100) }), req);
      const { created, view } = await startEntry(userId, scanId);
      return json(view, created ? 201 : 200);
    },
  },
  {
    method: 'GET',
    path: '/games/v1/entries/:entryId',
    handler: async (req) => json(await readEntry((await visitor(req)).userId, req.params.entryId ?? '')),
  },
  {
    method: 'POST',
    path: '/games/v1/entries/:entryId/play',
    handler: async (req) => {
      const { userId, firstName, nameLocked } = await visitor(req);
      const { player } = parseBody(playInput, req);
      // A name from a QuickLook link cannot be changed: the server uses it, whatever the phone sends
      const details = player && nameLocked && firstName ? { ...player, name: firstName } : player;
      return json(await playEntry(userId, req.params.entryId ?? '', details ?? null));
    },
  },
];
