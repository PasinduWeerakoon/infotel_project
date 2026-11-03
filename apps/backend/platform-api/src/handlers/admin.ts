/** Lambda `platform-admin`: admin sign in, users, logos, uploads, QuickLook name lookup. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { adminAuthRoutes } from '../routes/admin-auth.js';
import { logoRoutes } from '../routes/logos.js';

export const handler = lambdaHandler(createRouter([...adminAuthRoutes, ...logoRoutes]));
