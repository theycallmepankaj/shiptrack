import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document } from '../models/Document.js';
import { User } from '../models/User.js';
import { ingestDocument } from '../services/rag.js';
import { storeFile } from '../services/storage.js';
import { logger } from './logger.js';

const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed-docs');

/**
 * Dev convenience: loads the sample policy documents (server/seed-docs) into the chatbot's
 * knowledge base the first time, so the bot has something to answer from. Returns the docs created.
 */
export async function seedPolicyDocs() {
  if (await Document.exists({})) return [];
  const admin = await User.findOne({ role: 'admin' }).select('_id');
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith('.md')).sort();
  const docs = [];
  for (const filename of files) {
    const buffer = await readFile(path.join(DOCS_DIR, filename));
    const title = buffer.toString('utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? filename;
    const fileUrl = await storeFile(buffer, 'documents', 'md', 'text/markdown');
    docs.push(await Document.create({ title, filename, mimeType: 'text/markdown', size: buffer.length, fileUrl, uploadedBy: admin?._id }));
  }
  ingestInBackground(docs);
  return docs;
}

/** The Python service may still be starting (and downloading its embedding model): retry for a while. */
function ingestInBackground(docs, attempt = 1) {
  setTimeout(async () => {
    const pending = [];
    for (const doc of docs) {
      try {
        await ingestDocument(doc, undefined, { throwIfUnavailable: true });
      } catch {
        pending.push(doc);
      }
    }
    if (!pending.length) return logger.info(`Chatbot knowledge base ready: ${docs.length} policy documents indexed`);
    if (attempt < 12) ingestInBackground(pending, attempt + 1);
    else logger.warn('Couldn’t index the sample policy documents — start the AI service, then use “Retry” on Admin › Chatbot documents');
  }, Math.min(attempt * 5000, 20_000));
}
