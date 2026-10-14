import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    subject: { type: String, trim: true, default: '' },
    targetDate: { type: Date, required: true },
    dailyStudyHours: { type: Number, min: 0.5, max: 16, default: undefined },
    status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },
  },
  { timestamps: true }
);

export const Goal = mongoose.model('Goal', goalSchema);
