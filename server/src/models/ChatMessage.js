import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  { documentId: String, title: String, section: String, page: Number, refs: [Number] },
  { _id: false },
);

/** FR-51/52: chat history per user (userId null for guests) and reply ratings. */
const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    sources: { type: [sourceSchema], default: [] },
    intent: { type: String, enum: ['tracking', 'policy', 'smalltalk', null], default: null },
    confident: { type: Boolean, default: null },
    rating: { type: String, enum: ['up', 'down', null], default: null },
    ratedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// _id breaks createdAt ties (a question and a fast reply can share a millisecond).
chatMessageSchema.index({ sessionId: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ rating: 1, ratedAt: -1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
