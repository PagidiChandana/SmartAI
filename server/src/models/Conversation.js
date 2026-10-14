import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120, default: 'New chat' },
    mode: { type: String, enum: ['tutor', 'hint-first'], default: 'tutor' },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

conversationSchema.index({ user: 1, updatedAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
