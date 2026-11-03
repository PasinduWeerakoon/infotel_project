/**
 * Visitor API of Project A (signed-in QuickLook visitors).
 *
 *   GET  /games/v1/status
 *   POST /games/v1/entries                 { scanId }
 *   GET  /games/v1/entries/:entryId
 *   POST /games/v1/entries/:entryId/play   { player: { name, phone } } (needed for both games)
 */
import { z } from 'zod';
import { getSecrets } from '../config.js';
import { requireVisitor } from '../lib/auth.js';
import { type ApiRequest, type Route, json, parseBody } from '../lib/http.js';
import { getStatus, playEntry, readEntry, startEntry } from '../services/play-service.js';

/** Name and phone are only trimmed and limited in length, never validated */
const playInput = z.object({
  player: z
    .object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().min(1).max(30) })
    .optional(),
});

const visitor = async (req: ApiRequest) => requireVisitor(req, (await getSecrets()).sessionSecret);

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
      const { userId } = await visitor(req);
      const { player } = parseBody(playInput, req);
      return json(await playEntry(userId, req.params.entryId ?? '', player ?? null));
    },
  },
];
