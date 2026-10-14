import mongoose from 'mongoose';

// Append-only audit trail for privileged actions.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorEmail: { type: String, default: '' },
    action: { type: String, required: true, index: true, maxlength: 100 },
    targetType: { type: String, default: '', maxlength: 50 },
    targetId: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, capped: false }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export async function audit(actor, action, { targetType = '', targetId = '', meta = {} } = {}) {
  try {
    await AuditLog.create({
      actor: actor._id,
      actorEmail: actor.email,
      action,
      targetType,
      targetId: targetId?.toString?.() || String(targetId || ''),
      meta,
    });
  } catch {
    // audit must never break the primary action
  }
}
