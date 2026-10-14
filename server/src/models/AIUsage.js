import mongoose from 'mongoose';

// Per-request AI usage ledger: powers limits, debugging, and future quotas.
const aiUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    feature: { type: String, required: true, index: true }, // e.g. "tutor-ask"
    provider: { type: String, default: '' },
    success: { type: Boolean, default: true },
    fallback: { type: Boolean, default: false },
    latencyMs: { type: Number, default: 0 },
    error: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

aiUsageSchema.index({ user: 1, feature: 1, createdAt: -1 });

export const AIUsage = mongoose.model('AIUsage', aiUsageSchema);
