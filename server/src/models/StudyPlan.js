import mongoose from 'mongoose';

export const PLAN_STATUS = ['active', 'archived', 'completed'];
export const PLAN_SOURCE = ['ai', 'rule-based'];

const studyPlanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    examDate: { type: Date, required: true },
    targetScore: { type: Number, min: 0, max: 100, default: undefined },
    dailyHours: { type: Number, required: true, min: 0.5, max: 16 },
    weeklyHours: { type: Number, min: 1, max: 112, default: undefined },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    version: { type: Number, default: 1 },
    status: { type: String, enum: PLAN_STATUS, default: 'active', index: true },
    source: { type: String, enum: PLAN_SOURCE, default: 'rule-based' },
    note: { type: String, maxlength: 1000, default: '' },
    // Denormalized counters, refreshed by recalculatePlan()
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    skippedTasks: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    remainingMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One active plan per student — regeneration archives the old version (history).
studyPlanSchema.index({ user: 1, status: 1 });

export const StudyPlan = mongoose.model('StudyPlan', studyPlanSchema);
