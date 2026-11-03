/**
 * Admin: prize catalogue, game pause and settings (prefix /admin/v1/games).
 *
 *   GET    /prizes                 with allocated and given totals
 *   POST   /prizes
 *   PUT    /prizes/:prizeId
 *   DELETE /prizes/:prizeId        only if never allocated
 *   PUT    /games/:game/status     { paused }
 *   GET    /settings
 *   PUT    /settings               super admin
 */
import { z } from 'zod';
import { getSecrets, imageUrl } from '../config.js';
import {
  deletePrize,
  getPrize,
  getSettings,
  listPrizes,
  savePrize,
  saveSettings,
} from '../data/catalog-repo.js';
import { listAllAllocations } from '../data/sessions-repo.js';
import { GAMES, type Game, type Prize } from '../domain/types.js';
import { type AdminRole, requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { nowIso } from '../lib/time.js';
import { assertNoActivePlay } from '../services/live-guards.js';
import { prizesWithTotals } from '../services/prize-totals.js';
import { notifyScreens } from '../services/screen-notifier.js';

const BASE = '/admin/v1/games';
const READERS: AdminRole[] = ['games-admin', 'viewer', 'prize-desk'];
const WRITERS: AdminRole[] = ['games-admin'];

const admin = async (req: ApiRequest, roles: AdminRole[]) =>
  requireAdmin(req, (await getSecrets()).adminSecret, roles);

const prizeInput = z.object({
  name: z.string().min(1).max(60),
  stock: z.number().int().min(0).max(100_000),
  isMainPrize: z.boolean(),
  imageKey: z.string().max(200).nullable(),
});

async function list(req: ApiRequest) {
  await admin(req, READERS);
  return json({ items: await prizesWithTotals() });
}

/** A readable, stable ID from the name, for example "Pen drive 32 GB" becomes `pen-drive-32-gb`. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'prize';

async function create(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const input = parseBody(prizeInput, req);
  let prizeId = slug(input.name);
  if (await getPrize(prizeId)) prizeId = `${prizeId}-${Date.now().toString(36)}`;
  const prize: Prize = { prizeId, ...input, createdAt: nowIso() };
  await savePrize(prize);
  audit('games.prize.created', actor.username, { prizeId });
  return json({ ...prize, imageUrl: imageUrl(prize.imageKey) }, 201);
}

async function update(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const existing = await getPrize(req.params.prizeId ?? '');
  if (!existing) throw new HttpError(404, 'PRIZE_NOT_FOUND', 'Prize not found');
  const input = parseBody(prizeInput, req);
  const allocated = (await listAllAllocations())
    .filter((a) => a.prizeId === existing.prizeId)
    .reduce((sum, a) => sum + a.allocated, 0);
  if (input.stock < allocated) {
    throw new HttpError(
      409,
      'STOCK_BELOW_ALLOCATED',
      `${allocated} are already allocated. Reduce the allocation first`,
    );
  }
  const prize: Prize = { ...existing, ...input };
  await savePrize(prize);
  audit('games.prize.updated', actor.username, { prizeId: prize.prizeId });
  return json({ ...prize, imageUrl: imageUrl(prize.imageKey) });
}

async function remove(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const prizeId = req.params.prizeId ?? '';
  const used = (await listAllAllocations()).some((a) => a.prizeId === prizeId && a.allocated > 0);
  if (used)
    throw new HttpError(409, 'PRIZE_ALLOCATED', 'This prize is allocated to a session and cannot be deleted');
  await deletePrize(prizeId);
  audit('games.prize.deleted', actor.username, { prizeId });
  return noContent();
}

async function setGameStatus(req: ApiRequest) {
  const actor = await admin(req, WRITERS);
  const game = z.enum(GAMES as [Game, ...Game[]]).parse(req.params.game);
  const { paused } = parseBody(z.object({ paused: z.boolean() }), req);
  if (paused) await assertNoActivePlay([game], 'pause the game');
  const settings = await getSettings();
  await saveSettings({ ...settings, paused: { ...settings.paused, [game]: paused } });
  await notifyScreens(game, { type: 'refresh' });
  audit(paused ? 'games.game.paused' : 'games.game.opened', actor.username, { game });
  return json({ game, paused });
}

const settingsInput = z.object({
  lockTimeoutSeconds: z.number().int().min(20).max(300),
  repeatWinnerRule: z.boolean(),
  unusedPrizes: z.enum(['expire', 'roll-over']),
});

async function readSettings(req: ApiRequest) {
  await admin(req, READERS);
  return json(await getSettings());
}

async function writeSettings(req: ApiRequest) {
  const actor = await admin(req, []); // super admin only
  const input = parseBody(settingsInput, req);
  const settings = { ...(await getSettings()), ...input };
  await saveSettings(settings);
  audit('games.settings.updated', actor.username, input);
  return json(settings);
}

export const adminCatalogRoutes: Route[] = [
  { method: 'GET', path: `${BASE}/prizes`, handler: list },
  { method: 'POST', path: `${BASE}/prizes`, handler: create },
  { method: 'PUT', path: `${BASE}/prizes/:prizeId`, handler: update },
  { method: 'DELETE', path: `${BASE}/prizes/:prizeId`, handler: remove },
  { method: 'PUT', path: `${BASE}/games/:game/status`, handler: setGameStatus },
  { method: 'GET', path: `${BASE}/settings`, handler: readSettings },
  { method: 'PUT', path: `${BASE}/settings`, handler: writeSettings },
];
