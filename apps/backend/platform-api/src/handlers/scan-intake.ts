/** Lambda `platform-scan-intake`: QuickLook scan event webhook. */
import { createRouter } from '../lib/http.js';
import { lambdaHandler } from '../lib/lambda-adapter.js';
import { scanIntakeRoutes } from '../routes/scan-intake.js';

export const handler = lambdaHandler(createRouter(scanIntakeRoutes));
