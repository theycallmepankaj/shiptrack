import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Detects the image type from its first bytes — never trust the client's Content-Type. */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export const uploadRoot = () => path.resolve(env.UPLOAD_DIR);

function parseCloudinaryUrl(url) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  if (!m) throw new Error('CLOUDINARY_URL must look like cloudinary://key:secret@cloud');
  return { apiKey: m[1], apiSecret: m[2], cloud: m[3] };
}

async function uploadToCloudinary(buffer, mime, folder, resource = 'image') {
  const { apiKey, apiSecret, cloud } = parseCloudinaryUrl(env.CLOUDINARY_URL);
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=shiptrack/${folder}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(toSign + apiSecret).digest('hex');
  const form = new FormData();
  form.set('file', new Blob([buffer], { type: mime }));
  form.set('folder', `shiptrack/${folder}`);
  form.set('timestamp', String(timestamp));
  form.set('api_key', apiKey);
  form.set('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new ApiError(502, 'Could not store the file. Please try again.');
  return (await res.json()).secure_url;
}

/**
 * Stores an uploaded image (proof-of-delivery photo or signature) and returns its URL:
 * Cloudinary when configured, otherwise local disk served from /uploads.
 */
export async function storeImage(buffer, folder) {
  const type = sniffImage(buffer);
  if (!type) throw ApiError.badRequest('Upload a JPEG, PNG or WebP image');
  if (env.CLOUDINARY_URL) return uploadToCloudinary(buffer, type.mime, folder);
  const dir = path.join(uploadRoot(), folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${type.ext}`; // unguessable file name
  await writeFile(path.join(dir, name), buffer);
  return `${env.PUBLIC_URL}/uploads/${folder}/${name}`;
}

/** Stores a chatbot policy document (FR-35) the same way: Cloudinary "raw" upload or local disk. */
export async function storeFile(buffer, folder, ext, mime) {
  if (env.CLOUDINARY_URL) return uploadToCloudinary(buffer, mime, folder, 'raw');
  const dir = path.join(uploadRoot(), folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), buffer);
  return `${env.PUBLIC_URL}/uploads/${folder}/${name}`;
}

const localPath = (url) => {
  const prefix = `${env.PUBLIC_URL}/uploads/`;
  if (!url.startsWith(prefix)) return null;
  const file = path.resolve(uploadRoot(), url.slice(prefix.length));
  return file.startsWith(uploadRoot() + path.sep) ? file : null; // never escape the upload folder
};

/** Reads a stored file back (for re-indexing). */
export async function readStoredFile(url) {
  const file = localPath(url);
  if (file) return readFile(file);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Couldn't download ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Deletes a locally stored file. (Cloudinary files are left to the media library's retention.) */
export async function removeStoredFile(url) {
  const file = localPath(url);
  if (file) await unlink(file).catch(() => {});
}
