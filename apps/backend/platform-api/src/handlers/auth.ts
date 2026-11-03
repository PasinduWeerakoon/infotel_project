/** Lambda `platform-auth`: visitor sign in with QuickLook. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { scanLoginRoutes } from '../routes/scan-login.js';
import { visitorAuthRoutes } from '../routes/visitor-auth.js';

export const handler = lambdaHandler(createRouter([...visitorAuthRoutes, ...scanLoginRoutes]));
