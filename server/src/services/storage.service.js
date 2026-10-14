import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/env.js';

/**
 * Storage abstraction. Development uses local disk (server/uploads/resources).
 * Production should set STORAGE_PROVIDER to a cloud provider (e.g. "s3")
 * and implement uploadStream()/getStream() — the resource service only
 * calls this module, so swapping providers touches one file.
 */
const PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

export const storageDir = path.resolve('uploads', 'resources');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

export function storageProvider() {
  return PROVIDER;
}

export function assertLocalWritable() {
  if (PROVIDER !== 'local') {
    const err = new Error(`Storage provider "${PROVIDER}" is not configured. Set STORAGE_PROVIDER=local for development.`);
    err.statusCode = 501;
    throw err;
  }
}

export function resourceFilePath(storedName) {
  return path.join(storageDir, path.basename(storedName));
}

export function removeStoredFile(storedName) {
  if (!storedName) return;
  fs.rm(resourceFilePath(storedName), { force: true }, () => {});
}

export function storageMeta() {
  return { provider: PROVIDER, localDir: PROVIDER === 'local' ? 'uploads/resources' : null };
}

// Hide the internal disk path from API responses.
export function publicFileMeta(resource) {
  return {
    fileName: resource.fileName || '',
    mimeType: resource.mimeType || '',
    size: resource.size || 0,
  };
}

export { env };
