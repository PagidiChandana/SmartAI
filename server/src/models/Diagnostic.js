import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], default: [] },
    answer: { type: Number, required: true }, // index into options
    selected: { type: Number, default: null },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const diagnosticSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName: { type: String, required: true },
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, default: 0 },
    scorePct: { type: Number, default: 0 },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'pending'], default: 'pending' },
    responses: { type: [responseSchema], default: [] },
    submitted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Diagnostic = mongoose.model('Diagnostic', diagnosticSchema);
