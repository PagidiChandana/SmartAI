import mongoose from 'mongoose';

export const ATTEMPT_STATUS = ['in-progress', 'submitted', 'graded'];

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    // student responses
    selectedOption: { type: Number, default: null },
    boolAnswer: { type: Boolean, default: null },
    textAnswer: { type: String, maxlength: 5000, default: '' },
    // grading outcome
    isCorrect: { type: Boolean, default: null },
    marksAwarded: { type: Number, default: 0 },
    needsGrading: { type: Boolean, default: false },
    feedback: { type: String, maxlength: 1000, default: '' },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    attemptNo: { type: Number, required: true },
    status: { type: String, enum: ATTEMPT_STATUS, default: 'in-progress', index: true },
    answers: { type: [answerSchema], default: [] },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 }, // % over auto-graded marks
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // server-side timer (null = untimed)
    submittedAt: { type: Date, default: null },
    timeSpentSec: { type: Number, default: 0 },
    autosavedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

attemptSchema.index({ user: 1, assessment: 1, attemptNo: 1 }, { unique: true });
attemptSchema.index({ assessment: 1, status: 1 });

export const Attempt = mongoose.model('Attempt', attemptSchema);
