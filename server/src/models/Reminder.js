import mongoose from 'mongoose';

export const REMINDER_TYPES = ['task', 'exam', 'session', 'custom'];
// 'sending' is an internal transient claim state (prevents duplicate delivery).
export const REMINDER_STATUS = ['scheduled', 'sending', 'sent', 'cancelled', 'done', 'missed'];

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    type: { type: String, enum: REMINDER_TYPES, default: 'custom', index: true },
    // Optional deep link target, e.g. { kind: 'planTask', id } or { kind: 'assessment', id }.
    refKind: { type: String, enum: ['none', 'planTask', 'assessment'], default: 'none' },
    refId: { type: String, default: '' },
    // Stored as UTC. Clients send ISO-8601 with offset; the server converts.
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: REMINDER_STATUS, default: 'scheduled', index: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reminderSchema.index({ user: 1, status: 1, scheduledAt: 1 });

export const Reminder = mongoose.model('Reminder', reminderSchema);
