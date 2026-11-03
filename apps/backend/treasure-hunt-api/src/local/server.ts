/**
 * Local development server for the Treasure Hunt API on http://localhost:4002.
 * Instead of the every-minute job, open sessions are read from QuickLook (the QuickLook mock
 * locally) every SYNC_SECONDS, and ended sessions are finalized on the same beat.
 */
import { env } from '../config.js';
import { createRouter } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { adminRoutes } from '../routes/admin.js';
import { visitorRoutes } from '../routes/visitor.js';
import { syncOpenSessions } from '../services/sync-service.js';
import { finalizeEndedSessions } from '../services/winners-service.js';
import { startLocalServer } from './http-server.js';

const PORT = Number(process.env.PORT ?? 4002);
const router = createRouter([...visitorRoutes, ...adminRoutes]);

startLocalServer(router, PORT);

setInterval(async () => {
  try {
    await syncOpenSessions();
    await finalizeEndedSessions();
  } catch (error) {
    logger.error('Jobs failed', { error });
  }
}, env.SYNC_SECONDS * 1000);
logger.info(`Treasure Hunt API running on http://localhost:${PORT}`);
