import mongoose from 'mongoose';
import { ChatMessage } from '../models/ChatMessage.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * A chat session belongs to whoever sent its first message: a user, or a guest (userId null).
 * Guests can't continue a signed-in user's session, and users can't read each other's.
 */
export async function assertSessionOwner(sessionId, userId) {
  const first = await ChatMessage.findOne({ sessionId }).sort({ createdAt: 1, _id: 1 }).select('userId').lean();
  if (first && String(first.userId ?? '') !== String(userId ?? '')) throw ApiError.forbidden('This chat belongs to someone else');
}

export const ownerFilter = (sessionId, userId) => ({
  sessionId,
  userId: userId ? new mongoose.Types.ObjectId(userId) : null,
});
