import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

subjectSchema.index({ user: 1, name: 1 }, { unique: true });

export const Subject = mongoose.model('Subject', subjectSchema);
