/**
 * Image uploads (logos, prize images).
 *
 * The browser uploads straight to S3 with a short-lived pre-signed PUT URL. The content type
 * and exact size are part of the signature, so S3 rejects anything else. Locally, files go to
 * the dev server (`/_local/assets/*`) instead.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import { env } from '../config.js';

const s3 = new S3Client({});

export const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const publicUrl = (key: string | null): string | null =>
  key ? `${env.ASSETS_BASE_URL}/${key}` : null;

export async function createUpload(input: {
  purpose: 'logo' | 'prize';
  contentType: AllowedType;
  size: number;
}) {
  const key = `${input.purpose}s/${ulid().toLowerCase()}.${ALLOWED_TYPES[input.contentType]}`;

  if (env.ASSETS_MODE === 'local') {
    return { key, uploadUrl: `${env.ASSETS_BASE_URL}/${key}`, publicUrl: publicUrl(key) };
  }

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.ASSETS_BUCKET,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
    { expiresIn: 300 },
  );
  return { key, uploadUrl, publicUrl: publicUrl(key) };
}
