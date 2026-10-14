import mongoose from 'mongoose';

export const TOPIC_STATUS = ['not-started', 'in-progress', 'completed'];
export const TOPIC_DIFFICULTY = ['easy', 'medium', 'hard'];

const topicSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    section: { type: String, trim: true, maxlength: 200, default: '' },
    status: { type: String, enum: TOPIC_STATUS, default: 'not-started' },
    difficulty: { type: String, enum: TOPIC_DIFFICULTY, default: 'medium' },
    confidence: { type: Number, min: 1, max: 5, default: 3 },
    source: { type: String, enum: ['manual', 'upload'], default: 'manual' },
  },
  { timestamps: true }
);

export const Topic = mongoose.model('Topic', topicSchema);
