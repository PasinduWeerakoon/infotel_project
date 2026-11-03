/**
 * Local development server for the Games Event API.
 *   HTTP       http://localhost:4001  (visitor and admin routes)
 *   WebSocket  ws://localhost:4001/screens?screenKey=...  (stall screens)
 * Jobs run every 15 seconds instead of every minute.
 */
import { randomUUID } from 'node:crypto';
import { type WebSocket, WebSocketServer } from 'ws';
import { createRouter } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { adminCatalogRoutes } from '../routes/admin-catalog.js';
import { adminLiveRoutes } from '../routes/admin-live.js';
import { adminSessionRoutes } from '../routes/admin-sessions.js';
import { visitorRoutes } from '../routes/visitor.js';
import { useLocalSender } from '../services/screen-notifier.js';
import { connectScreen, disconnectScreen, handleScreenMessage, runJobs } from '../services/screen-service.js';
import { startLocalServer } from './http-server.js';

const PORT = Number(process.env.PORT ?? 4001);
const router = createRouter([
  ...visitorRoutes,
  ...adminSessionRoutes,
  ...adminCatalogRoutes,
  ...adminLiveRoutes,
]);
const server = startLocalServer(router, PORT);

// Stand-in for the API Gateway WebSocket API
const sockets = new Map<string, WebSocket>();
useLocalSender((connectionId, message) => {
  const socket = sockets.get(connectionId);
  if (!socket || socket.readyState !== socket.OPEN) return false;
  socket.send(message);
  return true;
});

const wss = new WebSocketServer({ server, path: '/screens' });
wss.on('connection', (socket, req) => {
  const connectionId = randomUUID();
  const screenKey = new URL(req.url ?? '', 'http://localhost').searchParams.get('screenKey') ?? undefined;
  // Listen at once: the screen says hello as soon as it is open, before the key check finishes
  const ready = connectScreen(screenKey, connectionId).then((ok) => {
    if (!ok) socket.close(4001, 'Unknown screen key');
    else sockets.set(connectionId, socket);
    return ok;
  });
  socket.on('message', (data) => {
    void ready.then((ok) => (ok ? handleScreenMessage(connectionId, data.toString()) : undefined));
  });
  socket.on('close', () => {
    sockets.delete(connectionId);
    void ready.then((ok) => (ok ? disconnectScreen(connectionId) : undefined));
  });
});

setInterval(() => void runJobs().catch((error) => logger.error('Jobs failed', { error })), 15_000);
logger.info(`Games Event API running on http://localhost:${PORT}`);
