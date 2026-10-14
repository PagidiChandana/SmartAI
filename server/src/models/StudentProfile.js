import mongoose from 'mongoose';

export const ACADEMIC_LEVELS = ['school', 'higher-secondary', 'undergraduate', 'postgraduate', 'other'];
export const LEARNING_STYLES = ['visual', 'auditory', 'reading', 'kinesthetic', 'mixed'];
export const EXAM_TYPES = ['college', 'gate', 'cat', 'upsc', 'competitive', 'other'];

const studentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    academicLevel: { type: String, enum: ACADEMIC_LEVELS, default: undefined },
    subjects: { type: [String], default: [] },
    learningStyle: { type: String, enum: LEARNING_STYLES, default: undefined },
    examType: { type: String, enum: EXAM_TYPES, default: undefined },
    dailyStudyHours: { type: Number, min: 0.5, max: 16, default: undefined },
  },
  { timestamps: true }
);

export const StudentProfile = mongoose.model('StudentProfile', studentProfileSchema);
