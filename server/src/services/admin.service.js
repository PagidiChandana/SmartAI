import { User, ACCOUNT_STATUS, isAdminRole, isSuperAdmin, ROLES } from '../models/User.js';
import { Resource, RESOURCE_STATUS } from '../models/Resource.js';
import { Assessment } from '../models/Assessment.js';
import { Attempt } from '../models/Attempt.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { PlanTask } from '../models/PlanTask.js';
import { Question } from '../models/Question.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Conversation } from '../models/Conversation.js';
import { Notification } from '../models/Notification.js';
import { AIUsage } from '../models/AIUsage.js';
import { AuditLog, audit } from '../models/AuditLog.js';
import { Report } from '../models/Report.js';
import { Taxonomy, TAXONOMY_TYPES, taxonomyLists } from '../models/Taxonomy.js';
import { Setting } from '../models/Setting.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function needAdmin(user) {
  if (!isAdminRole(user?.role)) throw new ApiError(403, 'Admin access required');
}
// Note: super-admin-only enforcement lives in the individual operations
// below (role grants, privileged suspension/deletion) plus the
// requireSuperAdmin() route middleware, so the checks stay next to the
// sensitive logic they protect.

// ---------- Platform statistics (all real database counts) ----------
export async function platformStats(user) {
  needAdmin(user);
  const [usersByRole, usersByStatus, resByStatus, assessByStatus, attempts, activePlans, conversations, ai, signups7d, reports] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Resource.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Assessment.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Attempt.countDocuments(),
    StudyPlan.countDocuments({ status: 'active' }),
    Conversation.countDocuments(),
    AIUsage.aggregate([
      { $group: { _id: { feature: '$feature', success: '$success' }, n: { $sum: 1 }, avgMs: { $avg: '$latencyMs' } } },
      { $sort: { n: -1 } },
    ]),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    Report.countDocuments({ status: 'open' }),
  ]);
  const map = (rows) => Object.fromEntries(rows.map((r) => [typeof r._id === 'string' ? r._id : JSON.stringify(r._id), r.n]));
  return {
    users: { byRole: map(usersByRole), byStatus: map(usersByStatus), signupsLast7d: signups7d },
    resources: map(resByStatus),
    assessments: map(assessByStatus),
    attempts,
    activePlans,
    conversations,
    aiUsage: ai.map((r) => ({ feature: r._id.feature, success: r._id.success, count: r.n, avgLatencyMs: Math.round(r.avgMs || 0) })),
    openReports: reports,
  };
}

// ---------- User management ----------
export async function setAccountStatus(admin, userId, status) {
  needAdmin(admin);
  if (!ACCOUNT_STATUS.includes(status)) throw new ApiError(400, 'Invalid status');
  if (userId.toString() === admin._id.toString()) throw new ApiError(400, 'Admins cannot change their own status');
  const target = await User.findById(userId);
  if (!target) throw new ApiError(404, 'User not found');
  // Ordinary admins may only suspend regular users. Privileged accounts
  // require a super admin, and the last super admin is never suspended.
  if ((target.role === 'admin' || isSuperAdmin(target.role)) && !isSuperAdmin(admin.role)) {
    throw new ApiError(403, 'Only super admins can suspend admin accounts');
  }
  if (isSuperAdmin(target.role) && status !== 'active') {
    const remaining = await User.countDocuments({ role: 'super_admin', status: 'active', _id: { $ne: target._id } });
    if (remaining === 0) throw new ApiError(400, 'Cannot suspend the last active super admin');
  }
  target.status = status;
  await target.save();
  await audit(admin, `user.${status}`, { targetType: 'User', targetId: target._id, meta: { email: target.email } });
  return target.toSafeJSON();
}

// ---------- Taxonomy ----------
export async function getTaxonomy(admin, { manage = false } = {}) {
  if (manage) needAdmin(admin);
  const lists = await taxonomyLists();
  if (!manage) return lists;
  const all = await Taxonomy.find().sort({ type: 1, value: 1 }).lean();
  return { ...lists, all };
}

export async function addTaxonomy(admin, { type, value }) {
  needAdmin(admin);
  if (!TAXONOMY_TYPES.includes(type)) throw new ApiError(400, 'Invalid taxonomy type');
  if (!value?.trim()) throw new ApiError(400, 'Value is required');
  try {
    const doc = await Taxonomy.create({ type, value: value.trim().slice(0, 100), active: true });
    await audit(admin, 'taxonomy.add', { targetType: 'Taxonomy', targetId: doc._id, meta: { type, value: doc.value } });
    return doc;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Value already exists');
    throw err;
  }
}

export async function setTaxonomyActive(admin, id, active) {
  needAdmin(admin);
  const doc = await Taxonomy.findById(id);
  if (!doc) throw new ApiError(404, 'Entry not found');
  doc.active = active;
  await doc.save();
  await audit(admin, active ? 'taxonomy.activate' : 'taxonomy.deactivate', { targetType: 'Taxonomy', targetId: doc._id, meta: { type: doc.type, value: doc.value } });
  return doc;
}

export async function deleteTaxonomy(admin, id) {
  needAdmin(admin);
  const doc = await Taxonomy.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, 'Entry not found');
  await audit(admin, 'taxonomy.delete', { targetType: 'Taxonomy', targetId: id, meta: { type: doc.type, value: doc.value } });
  return { id };
}

// ---------- Settings ----------
// Only these keys are user-configurable. Everything else (JWT secrets,
// database URIs, AI provider keys, rate limits) stays in environment config
// and can never be overwritten through this API.
export const SETTABLE_SETTINGS = {
  announcement: { max: 500, validate: null },
  'support.email': { max: 100, validate: (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
  'registration.enabled': { max: 5, validate: (v) => ['true', 'false'].includes(v.toLowerCase()) },
  'plan.maxDays': { max: 3, validate: (v) => Number.isInteger(Number(v)) && Number(v) >= 7 && Number(v) <= 120 },
  'plan.maxTasks': { max: 4, validate: (v) => Number.isInteger(Number(v)) && Number(v) >= 50 && Number(v) <= 2000 },
};

export async function getSettings(admin) {
  needAdmin(admin);
  return Setting.find().sort({ key: 1 }).lean();
}

export async function setSetting(admin, key, value) {
  needAdmin(admin);
  if (!key?.trim()) throw new ApiError(400, 'Key is required');
  const cleanKey = key.trim().slice(0, 100);
  // Allowlist: user-controlled settings must never overwrite secrets or
  // arbitrary server configuration. AI provider keys stay env-only.
  if (!SETTABLE_SETTINGS[cleanKey]) {
    throw new ApiError(400, `Setting "${cleanKey}" is not configurable. Allowed: ${Object.keys(SETTABLE_SETTINGS).join(', ')}`);
  }
  const str = String(value ?? '');
  const rule = SETTABLE_SETTINGS[cleanKey];
  if (str.length > rule.max) throw new ApiError(400, `${cleanKey} is too long (max ${rule.max})`);
  if (rule.validate && !rule.validate(str)) throw new ApiError(400, `${cleanKey} has an invalid value`);
  const doc = await Setting.findOneAndUpdate({ key: cleanKey }, { value: str }, { new: true, upsert: true });
  await audit(admin, 'setting.set', { targetType: 'Setting', targetId: doc._id, meta: { key: doc.key } });
  return doc;
}

// ---------- Usage monitoring ----------
export async function usageStats(admin, { page = 1, limit = 20 } = {}) {
  needAdmin(admin);
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [errors, total] = await Promise.all([
    AIUsage.find({ success: false }).populate('user', 'email role').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    AIUsage.countDocuments({ success: false }),
  ]);
  const totals = await AIUsage.aggregate([{ $group: { _id: '$feature', n: { $sum: 1 }, failures: { $sum: { $cond: ['$success', 0, 1] } } } }]);
  return { totals, errors: errors.map((e) => ({ ...e, user: e.user })), page: p, limit: l, total };
}

// ---------- Audit log ----------
export async function auditLog(admin, { action, page = 1, limit = 30 } = {}) {
  needAdmin(admin);
  const filter = action ? { action } : {};
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 30));
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, page: p, limit: l, total };
}

// ---------- Content reports ----------
export async function createReport(user, { resourceId, reason, details }) {
  const resource = await Resource.findById(resourceId);
  if (!resource) throw new ApiError(404, 'Resource not found');
  if (!reason?.trim()) throw new ApiError(400, 'Reason is required');
  const dup = await Report.findOne({ reporter: user._id, resource: resourceId, status: 'open' });
  if (dup) throw new ApiError(409, 'You already reported this material — admins are reviewing it');
  return Report.create({ reporter: user._id, resource: resourceId, reason: reason.trim().slice(0, 200), details: (details || '').slice(0, 2000) });
}

export async function listReports(admin, { status = 'open' } = {}) {
  needAdmin(admin);
  const filter = status === 'all' ? {} : { status };
  return Report.find(filter).populate('reporter', 'name email role').populate('resource', 'title subject status owner').sort({ createdAt: -1 }).limit(100).lean();
}

export async function handleReport(admin, id, { status, archiveResource = false, note = '' }) {
  needAdmin(admin);
  if (!['resolved', 'dismissed'].includes(status)) throw new ApiError(400, 'Status must be resolved or dismissed');
  const report = await Report.findById(id);
  if (!report) throw new ApiError(404, 'Report not found');
  report.status = status;
  report.handledBy = admin._id;
  report.handledAt = new Date();
  await report.save();
  let resource = null;
  if (archiveResource) {
    resource = await Resource.findById(report.resource);
    if (resource) {
      resource.status = 'archived';
      resource.reviewNote = (note || 'Archived after content report').slice(0, 500);
      await resource.save();
    }
  }
  await audit(admin, `report.${status}`, { targetType: 'Report', targetId: report._id, meta: { resource: report.resource.toString(), archived: archiveResource } });
  return { report, resourceArchived: Boolean(resource) };
}

// ---------- User management (extended) ----------
export async function createUser(admin, { name, email, password, role = 'student' }) {
  needAdmin(admin);
  if (!name?.trim()) throw new ApiError(400, 'Name is required');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Valid email is required');
  if (!password || password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  if (!ROLES.includes(role)) throw new ApiError(400, 'Invalid role');
  // Only super admins may create privileged accounts.
  if ((role === 'admin' || isSuperAdmin(role)) && !isSuperAdmin(admin.role)) {
    throw new ApiError(403, 'Only super admins can create admin accounts');
  }
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'Email already registered');
  const user = await User.create({ name: name.trim().slice(0, 80), email: email.toLowerCase(), password, role });
  await audit(admin, 'user.create', { targetType: 'User', targetId: user._id, meta: { email: user.email, role } });
  return user.toSafeJSON();
}

export async function getUserDetail(admin, id) {
  needAdmin(admin);
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  const uid = user._id;
  const [plans, tasks, attempts, resources, subjects, topics, diagnostics, conversations, notifications] = await Promise.all([
    StudyPlan.countDocuments({ user: uid }),
    PlanTask.countDocuments({ user: uid }),
    Attempt.countDocuments({ user: uid }),
    Resource.countDocuments({ owner: uid }),
    Subject.countDocuments({ user: uid }),
    Topic.countDocuments({ user: uid }),
    import('../models/Diagnostic.js').then((m) => m.Diagnostic.countDocuments({ user: uid })),
    Conversation.countDocuments({ user: uid }),
    Notification.countDocuments({ user: uid }),
  ]);
  const recentAttempts = await Attempt.find({ user: uid }).populate('assessment', 'title').sort({ submittedAt: -1 }).limit(5).lean();
  await audit(admin, 'user.inspect', { targetType: 'User', targetId: uid, meta: { email: user.email } });
  return {
    user: user.toSafeJSON(),
    learning: { plans, tasks, attempts, resources, subjects, topics, diagnostics, conversations, notifications },
    recentAttempts: recentAttempts.map((t) => ({
      id: t._id, assessment: t.assessment?.title || 'Assessment', score: t.score, maxScore: t.maxScore, status: t.status, submittedAt: t.submittedAt,
    })),
  };
}

export async function issuePasswordReset(admin, id) {
  needAdmin(admin);
  const target = await User.findById(id);
  if (!target) throw new ApiError(404, 'User not found');
  if ((target.role === 'admin' || isSuperAdmin(target.role)) && !isSuperAdmin(admin.role)) {
    throw new ApiError(403, 'Only super admins can reset privileged accounts');
  }
  const { forgotPassword } = await import('./auth.service.js');
  const { issued, rawToken } = await forgotPassword(target.email);
  if (!issued) throw new ApiError(500, 'Could not issue reset token');
  await audit(admin, 'user.reset-password', { targetType: 'User', targetId: target._id, meta: { email: target.email } });
  // Shown ONCE to the admin, who passes it to the user out-of-band.
  // Single-use, expires per RESET_TOKEN_MINUTES. Never logged.
  return { resetToken: rawToken, expiresInMinutes: env.resetTokenMinutes };
}

// ---------- Roles & permissions ----------
export async function roleMatrix(admin) {
  needAdmin(admin);
  const counts = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
  return {
    roles: ROLES,
    counts: Object.fromEntries(counts.map((r) => [r._id || 'unknown', r.n])),
    hierarchy: ['super_admin', 'admin', 'educator', 'student'],
    matrix: [
      { capability: 'Manage own learning data', student: true, educator: false, admin: false, super_admin: false },
      { capability: 'Create learning materials', student: false, educator: true, admin: true, super_admin: true },
      { capability: 'Create & grade assessments', student: false, educator: true, admin: true, super_admin: true },
      { capability: 'Review/approve materials', student: false, educator: false, admin: true, super_admin: true },
      { capability: 'Suspend regular users', student: false, educator: false, admin: true, super_admin: true },
      { capability: 'Grant/revoke admin roles', student: false, educator: false, admin: false, super_admin: true },
      { capability: 'Suspend/demote admins', student: false, educator: false, admin: false, super_admin: true },
      { capability: 'Manage taxonomy & settings', student: false, educator: false, admin: true, super_admin: true },
      { capability: 'View audit log & usage', student: false, educator: false, admin: true, super_admin: true },
    ],
    note: 'Super admins inherit every admin capability. Ordinary admins cannot touch privileged accounts.',
  };
}

// ---------- Study plans monitoring ----------
export async function listPlansAdmin(admin, { status, q, page = 1, limit = 20 } = {}) {
  needAdmin(admin);
  const filter = {};
  if (status) {
    if (!['active', 'archived', 'completed'].includes(status)) throw new ApiError(400, 'Invalid status');
    filter.status = status;
  }
  let userIds = null;
  if (q?.trim()) {
    const users = await User.find({ email: new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).select('_id').limit(50).lean();
    userIds = users.map((u) => u._id);
    filter.user = { $in: userIds.length ? userIds : [new (await import('mongoose')).Types.ObjectId()] };
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [items, total] = await Promise.all([
    StudyPlan.find(filter).populate('user', 'name email').sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    StudyPlan.countDocuments(filter),
  ]);
  return { items, page: p, limit: l, total };
}

export async function planDetailAdmin(admin, id) {
  needAdmin(admin);
  const plan = await StudyPlan.findById(id).populate('user', 'name email').populate('subjects', 'name').lean();
  if (!plan) throw new ApiError(404, 'Study plan not found');
  const byStatus = await PlanTask.aggregate([
    { $match: { plan: plan._id } },
    { $group: { _id: '$status', n: { $sum: 1 }, minutes: { $sum: '$durationMin' } } },
  ]);
  const byKind = await PlanTask.aggregate([
    { $match: { plan: plan._id } },
    { $group: { _id: '$kind', n: { $sum: 1 } } },
  ]);
  const byDay = await PlanTask.aggregate([
    { $match: { plan: plan._id } },
    { $group: { _id: '$date', n: { $sum: 1 }, minutes: { $sum: '$durationMin' } } },
    { $sort: { _id: 1 } },
  ]);
  // Metadata + aggregates only — individual task content stays private.
  // Plans are never modified here; regeneration is the student's own action.
  return {
    plan: { ...plan, user: plan.user },
    tasks: { byStatus, byKind, total: byStatus.reduce((s, r) => s + r.n, 0) },
    dailyVolume: byDay,
  };
}

// ---------- Learning resources management ----------
export async function listResourcesAdmin(admin, { status, q, format, page = 1, limit = 20 } = {}) {
  needAdmin(admin);
  const filter = {};
  if (status) {
    if (!RESOURCE_STATUS.includes(status)) throw new ApiError(400, 'Invalid status');
    filter.status = status;
  }
  if (format) filter.format = format;
  if (q?.trim()) filter.$text = { $search: q.trim().slice(0, 120) };
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  let query = Resource.find(filter).populate('owner', 'name email');
  query = q?.trim() ? query.select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }) : query.sort({ createdAt: -1 });
  const [items, total] = await Promise.all([
    query.skip((p - 1) * l).limit(l).lean(),
    Resource.countDocuments(filter),
  ]);
  return { items: items.map((r) => { delete r.filePath; delete r.extractedText; return r; }), page: p, limit: l, total };
}

export async function updateResourceAdmin(admin, id, data) {
  needAdmin(admin);
  const resource = await Resource.findById(id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  const allowed = ['title', 'description', 'subject', 'topic', 'difficulty', 'examType', 'format'];
  for (const k of allowed) {
    if (data[k] !== undefined) resource[k] = typeof data[k] === 'string' ? data[k].trim() : data[k];
  }
  await resource.save().catch((err) => {
    if (err.name === 'ValidationError') throw new ApiError(400, 'Invalid resource metadata');
    throw err;
  });
  await audit(admin, 'resource.edit', { targetType: 'Resource', targetId: resource._id, meta: { title: resource.title } });
  const obj = resource.toObject();
  delete obj.filePath;
  delete obj.extractedText;
  return obj;
}

export async function deleteResourceAdmin(admin, id) {
  needAdmin(admin);
  const { deleteOwn } = await import('./resource.service.js');
  const out = await deleteOwn(admin, id);
  await audit(admin, 'resource.delete', { targetType: 'Resource', targetId: id });
  return out;
}

// ---------- Quizzes & assessments management ----------
export async function listAssessmentsAdmin(admin, { status, q, page = 1, limit = 20 } = {}) {
  needAdmin(admin);
  const filter = {};
  if (status) {
    if (!['draft', 'published', 'closed', 'archived'].includes(status)) throw new ApiError(400, 'Invalid status');
    filter.status = status;
  }
  if (q?.trim()) filter.title = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [items, total] = await Promise.all([
    Assessment.find(filter).populate('owner', 'name email').sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    Assessment.countDocuments(filter),
  ]);
  const withCounts = await Promise.all(items.map(async (a) => ({
    ...a,
    questionCount: await Question.countDocuments({ assessment: a._id }),
    attemptCount: await Attempt.countDocuments({ assessment: a._id, status: { $ne: 'in-progress' } }),
  })));
  return { items: withCounts, page: p, limit: l, total };
}

export async function assessmentAttemptsAdmin(admin, id, { page = 1, limit = 20 } = {}) {
  needAdmin(admin);
  const a = await Assessment.findById(id).populate('owner', 'name email').lean();
  if (!a) throw new ApiError(404, 'Assessment not found');
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [items, total] = await Promise.all([
    Attempt.find({ assessment: a._id, status: { $ne: 'in-progress' } }).populate('user', 'name email').sort({ submittedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    Attempt.countDocuments({ assessment: a._id, status: { $ne: 'in-progress' } }),
  ]);
  // Summary rows only — individual answers stay private. Scores are never
  // mutated here; grading belongs to the owning educator.
  return {
    assessment: { id: a._id, title: a.title, subject: a.subject, status: a.status, owner: a.owner },
    items: items.map((t) => ({ id: t._id, user: t.user, score: t.score, maxScore: t.maxScore, accuracy: t.accuracy, status: t.status, submittedAt: t.submittedAt, timeSpentSec: t.timeSpentSec })),
    page: p, limit: l, total,
  };
}

// ---------- AI service monitoring (no keys ever leave the server) ----------
export async function aiStatus(admin) {
  needAdmin(admin);
  const provider = env.aiProvider;
  const configured = provider === 'openai' ? Boolean(env.openaiApiKey) : provider === 'gemini' ? Boolean(env.geminiApiKey) : provider === 'ollama';
  // Live reachability probe for keyless local Ollama only (2.5s timeout).
  // Never touches API keys; cloud providers are not probed (would spend quota).
  let ollama = null;
  if (provider === 'ollama') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${env.ollamaUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
      ollama = {
        reachable: res.ok,
        modelsAvailable: models,
        modelConfigured: env.ollamaModel,
        modelPulled: models.some((m) => m === env.ollamaModel || m.startsWith(`${env.ollamaModel}:`)),
      };
    } catch {
      ollama = { reachable: false, modelsAvailable: [], modelConfigured: env.ollamaModel, modelPulled: false };
    }
  }
  const failures24h = await AIUsage.countDocuments({ success: false, createdAt: { $gte: new Date(Date.now() - 86400000) } });
  const total24h = await AIUsage.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } });
  return {
    provider,
    configured,
    models: { openai: env.openaiModel, gemini: env.geminiModel, ollama: env.ollamaModel },
    ollama,
    mockWarning: provider === 'mock' ? 'AI_PROVIDER=mock — planner, tutor and drafting use labeled fallbacks, never live AI.' : null,
    credentialsWarning: provider !== 'mock' && !configured ? `AI_PROVIDER=${provider} but no API key is configured — calls will fail with clear errors.` : null,
    last24h: { total: total24h, failures: failures24h },
    note: 'API keys are server-side only and are never included in any response.',
  };
}

// ---------- Announcements ----------
export async function broadcastAnnouncement(admin, { title, body, roles }) {
  needAdmin(admin);
  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  const targetRoles = roles?.length ? roles : ['student', 'educator'];
  for (const r of targetRoles) {
    if (!['student', 'educator', 'admin', 'super_admin'].includes(r)) throw new ApiError(400, `Invalid role: ${r}`);
  }
  const users = await User.find({ role: { $in: targetRoles }, status: 'active' }).select('_id').lean();
  const capped = users.slice(0, 2000);
  if (capped.length) {
    await Notification.insertMany(capped.map((u) => ({
      user: u._id, from: admin._id, kind: 'announcement',
      title: title.trim().slice(0, 200), body: (body || '').slice(0, 2000),
    })));
  }
  await audit(admin, 'announcement.broadcast', { targetType: 'Announcement', targetId: '', meta: { roles: targetRoles, recipients: capped.length } });
  return { recipients: capped.length, truncated: users.length > capped.length };
}

// ---------- Notification stats (honest: in-app only) ----------
export async function notificationStats(admin) {
  needAdmin(admin);
  const [byKind, unread, last7d] = await Promise.all([
    Notification.aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }]),
    Notification.countDocuments({ read: false }),
    Notification.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
  ]);
  return {
    byKind: Object.fromEntries(byKind.map((r) => [r._id || 'unknown', r.n])),
    unread,
    last7d,
    pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    note: 'In-app delivery only. Push delivery is not configured — the subscribe endpoint returns 501.',
  };
}

// ---------- Platform analytics (time-bounded, real data) ----------
export async function platformAnalytics(admin, { days = 14 } = {}) {
  needAdmin(admin);
  const n = Math.min(90, Math.max(1, Number(days) || 14));
  const since = new Date(Date.now() - (n - 1) * 86400000);
  const dayFmt = (d) => d.toISOString().slice(0, 10);
  const [signups, attempts, topicsBySubject] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Attempt.aggregate([
      { $match: { submittedAt: { $gte: since }, status: { $ne: 'in-progress' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } }, n: { $sum: 1 }, avgAccuracy: { $avg: '$accuracy' } } },
      { $sort: { _id: 1 } },
    ]),
    Topic.aggregate([{ $group: { _id: '$subject', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
  ]);
  const subjectNames = await Subject.find({ _id: { $in: topicsBySubject.map((t) => t._id).filter(Boolean) } }).select('name').lean();
  const nameById = new Map(subjectNames.map((s) => [s._id.toString(), s.name]));
  const dayList = [];
  for (let i = n - 1; i >= 0; i -= 1) dayList.push(dayFmt(new Date(Date.now() - i * 86400000)));
  const sMap = new Map(signups.map((r) => [r._id, r.n]));
  const aMap = new Map(attempts.map((r) => [r._id, r]));
  return {
    days: n,
    signupsPerDay: dayList.map((d) => ({ date: d, count: sMap.get(d) || 0 })),
    attemptsPerDay: dayList.map((d) => ({ date: d, count: aMap.get(d)?.n || 0, avgAccuracy: aMap.get(d) ? Math.round(aMap.get(d).avgAccuracy || 0) : null })),
    topSubjects: topicsBySubject.map((t) => ({ subject: (t._id && nameById.get(t._id.toString())) || 'Unknown', topics: t.n })),
  };
}

// ---------- System health (only checkable services) ----------
export async function systemHealth(admin) {
  needAdmin(admin);
  let mongo = 'down';
  let mongoMs = null;
  try {
    const t = Date.now();
    await User.db.db.admin().ping();
    mongoMs = Date.now() - t;
    mongo = 'ok';
  } catch {
    mongo = 'down';
  }
  const mem = process.memoryUsage();
  return {
    status: mongo === 'ok' ? 'healthy' : 'degraded',
    mongo: { status: mongo, pingMs: mongoMs },
    uptimeSec: Math.round(process.uptime()),
    memory: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) },
    node: process.version,
    env: env.nodeEnv,
    scheduler: 'in-app reminder tick every 60s (single-instance; see scheduler.service.js)',
    aiProvider: env.aiProvider,
  };
}
