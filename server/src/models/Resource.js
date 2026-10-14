import mongoose from 'mongoose';

export const RESOURCE_FORMATS = ['pdf', 'note', 'article', 'video', 'link', 'other'];
export const RESOURCE_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
export const RESOURCE_STATUS = ['pending', 'approved', 'rejected', 'archived'];
export const RESOURCE_EXAM_TYPES = ['college', 'gate', 'cat', 'upsc', 'competitive', 'other'];

const resourceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    subject: { type: String, required: true, trim: true, maxlength: 100, index: true },
    topic: { type: String, trim: true, maxlength: 200, default: '', index: true },
    difficulty: { type: String, enum: RESOURCE_DIFFICULTY, default: 'beginner', index: true },
    examType: { type: String, enum: RESOURCE_EXAM_TYPES, default: 'other', index: true },
    format: { type: String, enum: RESOURCE_FORMATS, required: true, index: true },
    // File-backed materials (local disk in dev; pluggable provider for prod).
    filePath: { type: String, default: null, select: false },
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    // External URLs (educator-submitted, never claimed verified).
    externalUrl: { type: String, default: '' },
    urlVerified: { type: Boolean, default: false },
    status: { type: String, enum: RESOURCE_STATUS, default: 'pending', index: true },
    reviewNote: { type: String, maxlength: 500, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    views: { type: Number, default: 0 },
    bookmarkCount: { type: Number, default: 0 },
    completedCount: { type: Number, default: 0 },
    // Plain-text extraction for keyword retrieval (RAG baseline). Images/video
    // have none — retrieval then matches on title/topic/description only.
    extractedText: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

resourceSchema.index({ title: 'text', description: 'text', subject: 'text', topic: 'text' });

export const Resource = mongoose.model('Resource', resourceSchema);
