/**
 * Local development server for the Treasure Hunt API on http://localhost:4002.
 * Also takes QuickLook's scans (/integrations/quicklook/v1/hunt-scans). Instead of the
 * every-minute job, ended sessions are finalized every JOB_SECONDS.
 */
import { env } from '../config.js';
import { createRouter } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { adminRoutes } from '../routes/admin.js';
import { integrationRoutes } from '../routes/integration.js';
import { visitorRoutes } from '../routes/visitor.js';
import { finalizeEndedSessions } from '../services/winners-service.js';
import { startLocalServer } from './http-server.js';

const PORT = Number(process.env.PORT ?? 4002);
const router = createRouter([...visitorRoutes, ...adminRoutes, ...integrationRoutes]);

startLocalServer(router, PORT);

setInterval(async () => {
  try {
    await finalizeEndedSessions();
  } catch (error) {
    logger.error('Jobs failed', { error });
  }
}, env.JOB_SECONDS * 1000);
logger.info(`Treasure Hunt API running on http://localhost:${PORT}`);
