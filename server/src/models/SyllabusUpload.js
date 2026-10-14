import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    extractedChars: { type: Number, default: 0 },
    topicsCreated: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const SyllabusUpload = mongoose.model('SyllabusUpload', uploadSchema);
