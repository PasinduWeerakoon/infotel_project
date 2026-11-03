/** Lambda `hunt-admin`: everything under /admin/v1/hunt. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { adminRoutes } from '../routes/admin.js';

export const handler = lambdaHandler(createRouter(adminRoutes));
