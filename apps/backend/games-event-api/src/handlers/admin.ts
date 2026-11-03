/** Lambda `games-admin`: everything under /admin/v1/games. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { adminCatalogRoutes } from '../routes/admin-catalog.js';
import { adminLiveRoutes } from '../routes/admin-live.js';
import { adminSessionRoutes } from '../routes/admin-sessions.js';

export const handler = lambdaHandler(
  createRouter([...adminSessionRoutes, ...adminCatalogRoutes, ...adminLiveRoutes]),
);
