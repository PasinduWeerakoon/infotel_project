/**
 * Called by QuickLook's backend for every stall logo scan (decision D-20).
 *
 *   POST /integrations/quicklook/v1/hunt-scans   { "data": "<hex>" }   -> 200 { received, result }
 *
 * The message is encrypted with the key we gave QuickLook for this environment, which also proves
 * who sent it. 400 means the message could not be opened (wrong key, changed or too old) and
 * should not be sent again.
 */
import { z } from 'zod';
import { type Route, json, parseBody } from '../lib/http.js';
import { receiveScan } from '../services/scan-service.js';

const input = z.object({ data: z.string().min(16).max(8000) });

export const integrationRoutes: Route[] = [
  {
    method: 'POST',
    path: '/integrations/quicklook/v1/hunt-scans',
    handler: async (req) => {
      const { data } = parseBody(input, req);
      const { result } = await receiveScan(data);
      return json({ received: true, result });
    },
  },
];
