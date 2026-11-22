import mongoose from 'mongoose';

/** FR-50: raised from the chat when the bot can't answer. */
const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    name: { type: String, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    question: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
