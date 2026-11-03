/**
 * Logos, image uploads and the QuickLook name lookup.
 *
 *   GET    /platform/v1/logos                      public, used by screens and visitor apps
 *   GET    /admin/v1/logos                         games, hunt admins
 *   PUT    /admin/v1/logos/:logoId                 create or update a logo
 *   DELETE /admin/v1/logos/:logoId
 *   POST   /admin/v1/uploads                       pre-signed upload URL for a logo or prize image
 *   GET    /admin/v1/quicklook/users/:userId/name  prize desk: winner name, shown and never stored
 */
import { z } from 'zod';
import { getConfig } from '../config.js';
import { type Logo, deleteLogo, getLogo, listLogos, saveLogo } from '../data/logos-repo.js';
import { requireAdmin } from '../lib/auth.js';
import { type ApiRequest, HttpError, type Route, json, noContent, parseBody } from '../lib/http.js';
import { audit } from '../lib/logger.js';
import { nowIso } from '../lib/time.js';
import {
  ALLOWED_TYPES,
  type AllowedType,
  MAX_UPLOAD_BYTES,
  createUpload,
  publicUrl,
} from '../services/assets.js';
import { lookupDisplayName } from '../services/quicklook.js';
import { storedTestName } from '../services/token-exchange.js';

const withImage = (logo: Logo) => ({ ...logo, imageUrl: publicUrl(logo.imageKey) });

async function publicLogos() {
  const logos = await listLogos();
  return json(
    {
      items: logos.map(({ logoId, name, logoType, targetId, imageKey }) => ({
        logoId,
        name,
        logoType,
        targetId,
        imageUrl: publicUrl(imageKey),
      })),
    },
    200,
    // Screens poll this. CloudFront and browsers may reuse it for 15 seconds.
    { headers: { 'cache-control': 'public, max-age=15' } },
  );
}

async function adminLogos(req: ApiRequest) {
  const config = await getConfig();
  await requireAdmin(req, config.secrets.adminSecret, ['games-admin', 'hunt-admin', 'viewer']);
  return json({ items: (await listLogos()).map(withImage) });
}

const logoSchema = z
  .object({
    name: z.string().min(1).max(80),
    logoType: z.enum(['game', 'stall', 'portal', 'display']),
    targetId: z.string().max(80).nullable(),
    imageKey: z.string().max(200).nullable(),
  })
  .refine((logo) => logo.logoType !== 'game' || ['spin', 'lucky-dip'].includes(logo.targetId ?? ''), {
    message: 'A game logo must target spin or lucky-dip',
    path: ['targetId'],
  })
  .refine((logo) => logo.logoType !== 'display' || ['event', 'hunt'].includes(logo.targetId ?? ''), {
    message: 'A display logo must target event or hunt',
    path: ['targetId'],
  });

async function putLogo(req: ApiRequest) {
  const config = await getConfig();
  const admin = await requireAdmin(req, config.secrets.adminSecret, ['games-admin', 'hunt-admin']);
  const logoId = z
    .string()
    .regex(/^[a-z0-9_-]{2,60}$/)
    .parse(req.params.logoId);
  const input = parseBody(logoSchema, req);
  // Hunt admins manage stall logos, games admins manage game logos
  if (admin.role === 'hunt-admin' && input.logoType !== 'stall') {
    throw new HttpError(403, 'FORBIDDEN', 'Hunt admins can only manage stall logos');
  }
  const logo: Logo = { logoId, ...input, updatedAt: nowIso() };
  await saveLogo(logo);
  audit('logo.saved', admin.username, { logoId, logoType: logo.logoType, imageKey: logo.imageKey });
  return json(withImage(logo));
}

async function removeLogo(req: ApiRequest) {
  const config = await getConfig();
  const admin = await requireAdmin(req, config.secrets.adminSecret, ['games-admin', 'hunt-admin']);
  const logoId = req.params.logoId ?? '';
  if (!(await getLogo(logoId))) throw new HttpError(404, 'LOGO_NOT_FOUND', 'Logo not found');
  await deleteLogo(logoId);
  audit('logo.deleted', admin.username, { logoId });
  return noContent();
}

async function createUploadUrl(req: ApiRequest) {
  const config = await getConfig();
  await requireAdmin(req, config.secrets.adminSecret, ['games-admin', 'hunt-admin']);
  const input = parseBody(
    z.object({
      purpose: z.enum(['logo', 'prize']),
      contentType: z.enum(Object.keys(ALLOWED_TYPES) as [AllowedType, ...AllowedType[]]),
      size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Images must be 2 MB or smaller'),
    }),
    req,
  );
  return json(await createUpload(input), 201);
}

async function displayName(req: ApiRequest) {
  const config = await getConfig();
  const admin = await requireAdmin(req, config.secrets.adminSecret, [
    'prize-desk',
    'games-admin',
    'hunt-admin',
  ]);
  const userId = req.params.userId ?? '';
  // Test users (mock token mode) have their name stored by us. Otherwise ask QuickLook.
  const testName = await storedTestName(userId);
  const name = testName !== undefined ? testName : await lookupDisplayName(config, userId);
  audit('quicklook.name.lookup', admin.username, { userId });
  return json({ displayName: name });
}

export const logoRoutes: Route[] = [
  { method: 'GET', path: '/platform/v1/logos', handler: publicLogos },
  { method: 'GET', path: '/admin/v1/logos', handler: adminLogos },
  { method: 'PUT', path: '/admin/v1/logos/:logoId', handler: putLogo },
  { method: 'DELETE', path: '/admin/v1/logos/:logoId', handler: removeLogo },
  { method: 'POST', path: '/admin/v1/uploads', handler: createUploadUrl },
  { method: 'GET', path: '/admin/v1/quicklook/users/:userId/name', handler: displayName },
];
