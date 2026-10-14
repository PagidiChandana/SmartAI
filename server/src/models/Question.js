import mongoose from 'mongoose';

export const QUESTION_TYPES = ['mcq', 'truefalse', 'short'];

const questionSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    topic: { type: String, trim: true, maxlength: 200, default: '' },
    // mcq only
    options: { type: [String], default: [] },
    // answers below are NEVER sent to students before release (select:false + shaping)
    correctOption: { type: Number, default: null, select: false },
    correctBool: { type: Boolean, default: null, select: false },
    modelAnswer: { type: String, maxlength: 2000, default: '', select: false },
    explanation: { type: String, maxlength: 2000, default: '' },
    marks: { type: Number, min: 0.5, max: 100, default: 1 },
    // AI-draft workflow: must be educator-reviewed before publishing
    aiGenerated: { type: Boolean, default: false },
    reviewed: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

questionSchema.index({ assessment: 1, order: 1 });

export const Question = mongoose.model('Question', questionSchema);
