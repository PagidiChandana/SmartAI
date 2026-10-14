import mongoose from 'mongoose';

const recommendationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
    score: { type: Number, required: true },
    reasons: { type: [String], default: [] },
    context: { type: String, maxlength: 200, default: '' },
    ranker: { type: String, default: 'rule-v1' },
  },
  { timestamps: true }
);

recommendationSchema.index({ user: 1, score: -1 });
recommendationSchema.index({ user: 1, resource: 1, context: 1 });

export const Recommendation = mongoose.model('Recommendation', recommendationSchema);
