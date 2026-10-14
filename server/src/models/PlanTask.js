import mongoose from 'mongoose';

export const TASK_KIND = ['learn', 'revision', 'practice-test', 'break'];
export const TASK_STATUS = ['pending', 'completed', 'skipped'];

const planTaskSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'StudyPlan', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    objective: { type: String, trim: true, maxlength: 500, default: '' },
    kind: { type: String, enum: TASK_KIND, default: 'learn' },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD (local study day)
    startMin: { type: Number, min: 0, max: 1439, default: 540 }, // minutes after midnight, default 09:00
    durationMin: { type: Number, required: true, min: 5, max: 240 },
    status: { type: String, enum: TASK_STATUS, default: 'pending', index: true },
  },
  { timestamps: true }
);

planTaskSchema.index({ user: 1, date: 1, status: 1 });
planTaskSchema.index({ plan: 1, date: 1 });

export const PlanTask = mongoose.model('PlanTask', planTaskSchema);
