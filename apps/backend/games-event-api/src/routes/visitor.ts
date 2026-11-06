/**
 * Visitor API of Project A (signed-in QuickLook visitors).
 *
 *   GET  /games/v1/status
 *   POST /games/v1/entries                 { scanId }
 *   GET  /games/v1/entries/:entryId
 *   POST /games/v1/entries/:entryId/play   { player: { name, phone } } (needed for both games,
 *                                          the name is the QuickLook one when the session has it locked)
 *   POST /games/v1/entries/:entryId/phone  { phone } (a QuickLook winner, after the win)
 */
import { z } from 'zod';
import { getSecrets } from '../config.js';
import { requireVisitor } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, parseBody } from '../lib/http.js';
import { LIMITS, rateLimit } from '../lib/rate-limit.js';
import { addWinnerPhone, getStatus, playEntry, readEntry, startEntry } from '../services/play-service.js';

/** Name and phone are only trimmed and limited in length, never validated */
const playInput = z.object({
  player: z
    .object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().max(30).default('') })
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
      const { userId, firstName, nameLocked } = await visitor(req);
      const { scanId } = parseBody(z.object({ scanId: z.string().min(1).max(100) }), req);
      // A locked name (QuickLook or guest) is checked early: one play per name per session
      const { created, view } = await startEntry(userId, scanId, nameLocked ? firstName : '');
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
      const { userId, firstName, nameLocked, phone } = await visitor(req);
      const { player } = parseBody(playInput, req);
      // A QuickLook player (name locked, no phone in the session) plays first, the phone is asked
      // after a win. A locked name and a guest's phone cannot be changed: the server uses them.
      const phoneLater = nameLocked && Boolean(firstName) && !phone;
      const typed = player ?? (phoneLater ? { name: firstName, phone: '' } : undefined);
      const named = typed && nameLocked && firstName ? { ...typed, name: firstName } : typed;
      const details = named && phone ? { ...named, phone } : named;
      if (details && !details.phone && !phoneLater) {
        throw new HttpError(422, 'PLAYER_DETAILS_REQUIRED', 'Please enter your name and phone number');
      }
      return json(await playEntry(userId, req.params.entryId ?? '', details ?? null));
    },
  },
  {
    method: 'POST',
    path: '/games/v1/entries/:entryId/phone',
    handler: async (req) => {
      const { userId } = await visitor(req);
      const { phone } = parseBody(z.object({ phone: z.string().trim().min(1).max(30) }), req);
      return json(await addWinnerPhone(userId, req.params.entryId ?? '', phone));
    },
  },
];
