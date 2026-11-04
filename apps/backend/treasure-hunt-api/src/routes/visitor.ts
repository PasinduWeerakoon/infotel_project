/**
 * Visitor and screen API of Project B.
 *
 *   GET /hunt/v1/status
 *   GET /hunt/v1/leaderboard?sessionId=&top=10   public (leaderboard screen and phones)
 *
 * Visitors do not sign in to the hunt: QuickLook sends their scans to us (decision D-20).
 */
import { z } from 'zod';
import { type Route, json } from '../lib/http.js';
import { getStatus, leaderboard } from '../services/visitor-service.js';

export const visitorRoutes: Route[] = [
  {
    method: 'GET',
    path: '/hunt/v1/status',
    handler: async () => json(await getStatus(), 200, { headers: { 'cache-control': 'public, max-age=5' } }),
  },
  {
    method: 'GET',
    path: '/hunt/v1/leaderboard',
    handler: async (req) => {
      const top = z.coerce.number().int().min(1).max(50).default(10).parse(req.query.top);
      // CloudFront and browsers may reuse it for 3 seconds
      return json(await leaderboard(req.query.sessionId, top), 200, {
        headers: { 'cache-control': 'public, max-age=3' },
      });
    },
  },
];
