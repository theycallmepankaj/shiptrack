import mongoose from 'mongoose';
import { ChatMessage } from '../models/ChatMessage.js';
import { Document } from '../models/Document.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { DOC_TYPES } from '../middleware/upload.js';
import { callAi } from '../services/aiClient.js';
import { deleteDocumentChunks, ingestDocument } from '../services/rag.js';
import { removeStoredFile, storeFile } from '../services/storage.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const documentView = (d) => ({
  id: d._id.toString(),
  title: d.title,
  filename: d.filename,
  mimeType: d.mimeType,
  size: d.size,
  fileUrl: d.fileUrl,
  status: d.status,
  chunkCount: d.chunkCount,
  pages: d.pages,
  error: d.error,
  indexedAt: d.indexedAt,
  createdAt: d.createdAt,
});

const titleFrom = (filename) =>
  filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 120) || 'Untitled document';

/** Checks the bytes, not just the extension: PDFs start with %PDF, text must be valid UTF-8. */
function checkContent(buffer, ext) {
  if (ext === 'pdf') {
    if (buffer.subarray(0, 4).toString('latin1') !== '%PDF') throw ApiError.badRequest('That file isn’t a valid PDF');
    return;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw ApiError.badRequest('Text and Markdown files must be UTF-8');
  }
  if (!buffer.toString('utf8').trim()) throw ApiError.badRequest('The file is empty');
}

// GET /api/admin/documents
export async function listDocuments(_req, res) {
  const docs = await Document.find().sort({ createdAt: -1 }).lean();
  res.json({ documents: docs.map(documentView) });
}

// POST /api/admin/documents (multipart: file, title?) — FR-35
export async function uploadDocument(req, res) {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Choose a PDF, Markdown or text file');
  const ext = file.originalname.split('.').pop().toLowerCase();
  checkContent(file.buffer, ext);
  const filename = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-120);
  const fileUrl = await storeFile(file.buffer, 'documents', ext === 'markdown' ? 'md' : ext, DOC_TYPES[ext]);
  const doc = await Document.create({
    title: req.body.title?.trim() || titleFrom(filename),
    filename,
    mimeType: DOC_TYPES[ext],
    size: file.size,
    fileUrl,
    uploadedBy: req.user.id,
  });
  ingestDocument(doc, file.buffer).catch((err) => logger.error('ingest crashed', err.message));
  res.status(201).json({ document: documentView(doc) });
}

// POST /api/admin/documents/:id/reindex — retry a failed ingest
export async function reindexDocument(req, res) {
  const doc = mongoose.isValidObjectId(req.params.id) && (await Document.findById(req.params.id));
  if (!doc) throw ApiError.notFound('Document not found');
  if (doc.status === 'processing') throw ApiError.badRequest('This document is already being processed');
  doc.status = 'processing';
  doc.error = null;
  await doc.save();
  ingestDocument(doc).catch((err) => logger.error('ingest crashed', err.message));
  res.json({ document: documentView(doc) });
}

// DELETE /api/admin/documents/:id — FR-35: the bot stops citing it immediately.
export async function deleteDocument(req, res) {
  const doc = mongoose.isValidObjectId(req.params.id) && (await Document.findById(req.params.id));
  if (!doc) throw ApiError.notFound('Document not found');
  try {
    await deleteDocumentChunks(doc._id.toString());
  } catch (err) {
    throw new ApiError(503, `Couldn’t remove the document from the chatbot’s index (${err.message}). Try again.`);
  }
  await doc.deleteOne();
  await removeStoredFile(doc.fileUrl);
  res.status(204).end();
}

// GET /api/admin/chat/overview — ratings (FR-52), open tickets (FR-50) and the chatbot's setup.
export async function chatOverview(_req, res) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [ratings, recentDown, tickets, status] = await Promise.all([
    ChatMessage.aggregate([{ $match: { rating: { $ne: null }, ratedAt: { $gte: since } } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
    ChatMessage.find({ rating: 'down' }).sort({ ratedAt: -1 }).limit(5).lean(),
    SupportTicket.find().sort({ status: 1, createdAt: -1 }).limit(50).lean(),
    callAi('/rag/status', undefined, { method: 'GET', timeoutMs: 3000 }).catch(() => null),
  ]);
  // Show each 👎 reply next to the question it answered.
  const questions = await Promise.all(
    recentDown.map((m) => ChatMessage.findOne({ sessionId: m.sessionId, role: 'user', createdAt: { $lte: m.createdAt } }).sort({ createdAt: -1 }).select('content').lean()),
  );
  const count = (r) => ratings.find((x) => x._id === r)?.n ?? 0;
  res.json({
    ratings: { up: count('up'), down: count('down') },
    recentDown: recentDown.map((m, i) => ({ id: m._id.toString(), question: questions[i]?.content ?? null, answer: m.content, ratedAt: m.ratedAt })),
    tickets: tickets.map((t) => ({ id: t._id.toString(), name: t.name, email: t.email, question: t.question, status: t.status, createdAt: t.createdAt, resolvedAt: t.resolvedAt })),
    assistant: status && { embedder: status.embedder, llm: status.llm, model: status.model, vectorSearch: status.vector_search, chunks: status.chunks },
  });
}

// PATCH /api/admin/tickets/:id
export async function updateTicket(req, res) {
  const t = mongoose.isValidObjectId(req.params.id) && (await SupportTicket.findById(req.params.id));
  if (!t) throw ApiError.notFound('Ticket not found');
  t.status = req.body.status;
  t.resolvedAt = t.status === 'resolved' ? new Date() : null;
  await t.save();
  res.json({ ticket: { id: t._id.toString(), status: t.status, resolvedAt: t.resolvedAt } });
}
