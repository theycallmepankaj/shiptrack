import mongoose from 'mongoose';
import { ChatMessage } from '../models/ChatMessage.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { User } from '../models/User.js';
import { ownerFilter } from '../services/chatAccess.js';
import { notifyAdmins } from '../services/notifications.js';
import { ApiError } from '../utils/ApiError.js';

export const messageView = (m) => ({
  id: m._id.toString(),
  role: m.role,
  content: m.content,
  sources: m.sources ?? [],
  intent: m.intent,
  confident: m.confident,
  rating: m.rating,
  createdAt: m.createdAt,
});

// GET /api/chat/history?sessionId= — FR-51. Signed-in users without a sessionId get their latest chat.
export async function history(req, res) {
  const userId = req.user?.id ?? null;
  let { sessionId } = req.query;
  if (!sessionId && userId) {
    sessionId = (await ChatMessage.findOne({ userId }).sort({ createdAt: -1, _id: -1 }).select('sessionId').lean())?.sessionId;
  }
  if (!sessionId) return res.json({ sessionId: null, messages: [] });
  const messages = await ChatMessage.find(ownerFilter(sessionId, userId)).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
  res.json({ sessionId, messages: messages.reverse().map(messageView) });
}

// PATCH /api/chat/messages/:id/rating — FR-52
export async function rate(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Message not found');
  const userId = req.user?.id ?? null;
  const filter = { _id: req.params.id, role: 'assistant', userId: userId ? new mongoose.Types.ObjectId(userId) : null };
  if (!userId) {
    if (!req.body.sessionId) throw ApiError.notFound('Message not found');
    filter.sessionId = req.body.sessionId; // guests prove ownership with their (unguessable) session id
  }
  const m = await ChatMessage.findOneAndUpdate(filter, { rating: req.body.rating, ratedAt: req.body.rating ? new Date() : null }, { new: true });
  if (!m) throw ApiError.notFound('Message not found');
  res.json({ message: messageView(m) });
}

// POST /api/chat/tickets — FR-50: "raise a support ticket" when the bot isn't sure.
export async function createTicket(req, res) {
  const userId = req.user?.id ?? null;
  let { email, name } = req.body;
  if (userId) {
    const u = await User.findById(userId).select('email name');
    email = u?.email ?? email;
    name = u?.name ?? name;
  }
  if (!email) throw ApiError.badRequest('Enter your email so we can reply', { email: ['Enter your email so we can reply'] });
  const ticket = await SupportTicket.create({ userId, sessionId: req.body.sessionId, messageId: req.body.messageId ?? null, email, name, question: req.body.question });
  notifyAdmins({ type: 'support', title: 'New support ticket', message: `${name ?? email}: ${req.body.question}`.slice(0, 300), link: '/admin/documents' }).catch(() => {});
  res.status(201).json({ ticket: { id: ticket._id.toString(), status: ticket.status, createdAt: ticket.createdAt } });
}
