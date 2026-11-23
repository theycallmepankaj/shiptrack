import { env } from '../config/env.js';
import { Document } from '../models/Document.js';
import { logger } from '../utils/logger.js';
import { callAi } from './aiClient.js';
import { readStoredFile } from './storage.js';
import { notifyAdmins } from './notifications.js';

let emitStatus = () => {};
/** sockets/index.js registers the `document:status` emitter (avoids an import cycle). */
export const onDocumentStatus = (fn) => {
  emitStatus = fn;
};

const statusPayload = (d) => ({ documentId: d._id.toString(), status: d.status, chunkCount: d.chunkCount, pages: d.pages, error: d.error, indexedAt: d.indexedAt });

/**
 * §4.10 ingest: Python extracts, chunks, embeds and stores the text in doc_chunks.
 * Runs in the background after the upload responds; admins see progress via `document:status`.
 * Returns true on success; `retryable` errors (AI service down) are rethrown for the caller to retry.
 */
export async function ingestDocument(doc, buffer, { throwIfUnavailable = false } = {}) {
  try {
    buffer ??= await readStoredFile(doc.fileUrl);
    const out = await callAi(
      '/rag/ingest',
      { document_id: doc._id.toString(), title: doc.title, filename: doc.filename, content_b64: buffer.toString('base64') },
      { timeoutMs: 180_000, returnErrorBody: true },
    );
    Object.assign(doc, { status: 'ready', chunkCount: out.chunk_count, pages: out.pages, error: null, indexedAt: new Date() });
  } catch (err) {
    if (throwIfUnavailable && !err.status) throw err; // network/timeout: let the seeder retry
    const message = err.status === 422 && typeof err.detail === 'string' ? err.detail : 'The AI service couldn’t process this document. Try again in a minute.';
    logger.warn(`Ingest failed for "${doc.title}": ${err.detail ?? err.message}`);
    Object.assign(doc, { status: 'failed', error: message });
  }
  // The document may have been deleted while it was processing.
  const saved = await Document.findOneAndUpdate({ _id: doc._id }, { status: doc.status, chunkCount: doc.chunkCount, pages: doc.pages, error: doc.error, indexedAt: doc.indexedAt }, { new: true });
  if (saved) emitStatus(statusPayload(saved));
  if (saved?.status === 'failed') {
    notifyAdmins({ type: 'system', title: 'Document couldn’t be indexed', message: `“${saved.title}”: ${saved.error}`, link: '/admin/documents' }).catch(() => {});
  }
  return doc.status === 'ready';
}

export async function deleteDocumentChunks(id) {
  await callAi(`/rag/documents/${id}`, undefined, { method: 'DELETE', timeoutMs: 10_000 });
}

/**
 * Streams a chat answer from Python's /rag/chat (NDJSON) and calls onEvent for each event:
 * { type: 'meta' | 'token' | 'replace' | 'done', ... }. Throws if the service is unreachable.
 */
export async function streamChat({ message, history, userId, requestId }, onEvent, signal) {
  const res = await fetch(`${env.AI_SERVICE_URL}/rag/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': env.INTERNAL_API_KEY, ...(requestId && { 'x-request-id': requestId }) },
    body: JSON.stringify({ message, history, user_id: userId }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)].filter(Boolean)),
  });
  if (!res.ok || !res.body) throw new Error(`AI service /rag/chat responded ${res.status}`);
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of res.body) {
    buffered += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}
