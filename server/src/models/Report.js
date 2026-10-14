import mongoose from 'mongoose';

export const REPORT_STATUS = ['open', 'resolved', 'dismissed'];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    details: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: REPORT_STATUS, default: 'open', index: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index({ resource: 1, reporter: 1, status: 1 });

export const Report = mongoose.model('Report', reportSchema);
