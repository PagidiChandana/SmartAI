import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    kind: { type: String, enum: ['feedback', 'announcement', 'system', 'reminder'], default: 'feedback' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
