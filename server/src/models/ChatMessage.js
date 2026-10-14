import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    title: { type: String, required: true },
    snippet: { type: String, maxlength: 500, default: '' },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    // Only documents actually retrieved during this answer. Never fabricated.
    sources: { type: [sourceSchema], default: [] },
    fallback: { type: Boolean, default: false }, // true = rule-based fallback, not LLM
    vote: { type: String, enum: ['helpful', 'unhelpful', null], default: null },
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: 1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
