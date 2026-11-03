/** Lambda `hunt-visitor`: status, scan results, my progress, leaderboard. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { visitorRoutes } from '../routes/visitor.js';

export const handler = lambdaHandler(createRouter(visitorRoutes));
