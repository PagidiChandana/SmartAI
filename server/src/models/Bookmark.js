import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bookmarkSchema.index({ user: 1, resource: 1 }, { unique: true });

export const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
