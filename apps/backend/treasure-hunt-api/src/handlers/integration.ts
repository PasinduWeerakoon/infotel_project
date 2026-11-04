/** Lambda `hunt-scans`: the scans QuickLook's backend sends. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { integrationRoutes } from '../routes/integration.js';

export const handler = lambdaHandler(createRouter(integrationRoutes));
