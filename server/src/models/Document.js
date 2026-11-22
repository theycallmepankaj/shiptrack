import mongoose from 'mongoose';

/** A policy document in the chatbot's knowledge base (FR-35). Chunks live in doc_chunks (written by Python). */
const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    fileUrl: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing', index: true },
    chunkCount: { type: Number, default: 0 },
    pages: { type: Number, default: 0 },
    error: { type: String, default: null },
    indexedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Document = mongoose.model('Document', documentSchema);
