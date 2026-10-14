import mongoose from 'mongoose';

export const ASSESSMENT_KIND = ['test', 'assignment'];
export const ASSESSMENT_STATUS = ['draft', 'published', 'closed', 'archived'];
export const ASSESSMENT_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
export const RELEASE_MODES = ['immediate', 'after-deadline', 'manual', 'never'];

const assessmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    kind: { type: String, enum: ASSESSMENT_KIND, default: 'test' },
    subject: { type: String, required: true, trim: true, maxlength: 100, index: true },
    topic: { type: String, trim: true, maxlength: 200, default: '' },
    difficulty: { type: String, enum: ASSESSMENT_DIFFICULTY, default: 'beginner' },
    durationMin: { type: Number, min: 0, max: 600, default: 30 }, // 0 = untimed (assignments)
    deadline: { type: Date, default: null },
    totalMarks: { type: Number, min: 0, default: 0 }, // recomputed from questions
    status: { type: String, enum: ASSESSMENT_STATUS, default: 'draft', index: true },
    // who may take it: 'all' students, or listed student ids
    visibility: { type: String, enum: ['all', 'selected'], default: 'all' },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    maxAttempts: { type: Number, min: 1, max: 10, default: 1 },
    // result visibility control — correct answers never leak before release
    releaseMode: { type: String, enum: RELEASE_MODES, default: 'after-deadline' },
    released: { type: Boolean, default: false }, // manual release toggle
    showExplanations: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assessmentSchema.index({ status: 1, subject: 1 });

export const Assessment = mongoose.model('Assessment', assessmentSchema);
