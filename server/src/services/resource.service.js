import { Resource } from '../models/Resource.js';
import { Bookmark } from '../models/Bookmark.js';
import { Recommendation } from '../models/Recommendation.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Topic } from '../models/Topic.js';
import { Diagnostic } from '../models/Diagnostic.js';
import { PlanTask } from '../models/PlanTask.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { ApiError } from '../utils/ApiError.js';
import { isAdminRole } from '../models/User.js';
import { rankResources, RANKER_VERSION } from './recommender.service.js';
import { assertLocalWritable, removeStoredFile, publicFileMeta, resourceFilePath } from './storage.service.js';
import { extractStoredFileText } from './syllabus.service.js';

const norm = (s) => (s || '').toString().trim().toLowerCase();

function canView(resource, user) {
  if (isAdminRole(user.role)) return true;
  if (resource.owner.toString() === user._id.toString()) return true;
  return resource.status === 'approved';
}

function shape(resource, { bookmarked = false, completed = false } = {}) {
  const obj = resource.toObject ? resource.toObject() : resource;
  delete obj.filePath;
  delete obj.extractedText; // retrieval index is never sent to clients
  return {
    ...obj,
    ...publicFileMeta(resource),
    hasFile: Boolean(resource.filePath),
    bookmarked,
    completed,
  };
}

// ---------- Educator: submit ----------
export async function createResource(user, data, file) {
  if (user.role !== 'educator' && !isAdminRole(user.role)) {
    throw new ApiError(403, 'Only educators can submit learning materials');
  }
  const hasFile = Boolean(file);
  const hasUrl = Boolean(data.externalUrl);
  if (hasFile && hasUrl) throw new ApiError(400, 'Provide either a file or an external URL, not both');
  if (!hasFile && !hasUrl) throw new ApiError(400, 'Attach a file or provide an external URL');
  if (hasUrl && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(data.externalUrl)) {
    throw new ApiError(400, 'External URL must be a valid http(s) address');
  }
  if (hasFile) assertLocalWritable();

  // Index text for tutor retrieval (best-effort; images/video get none).
  let extractedText = '';
  if (file) {
    try {
      extractedText = await extractStoredFileText(file.path, file.originalname);
    } catch {
      extractedText = '';
    }
  }

  const resource = await Resource.create({
    owner: user._id,
    title: data.title.trim(),
    description: data.description || '',
    subject: data.subject.trim(),
    topic: (data.topic || '').trim(),
    difficulty: data.difficulty || 'beginner',
    examType: data.examType || 'other',
    format: data.format,
    filePath: file ? file.filename : null,
    fileName: file ? file.originalname : '',
    mimeType: file ? file.mimetype : '',
    size: file ? file.size : 0,
    extractedText,
    externalUrl: hasUrl ? data.externalUrl : '',
    urlVerified: false, // educator-submitted links are never claimed verified
    status: isAdminRole(user.role) ? 'approved' : 'pending',
  });
  return shape(resource);
}

export async function listMine(user) {
  const docs = await Resource.find({ owner: user._id }).sort({ createdAt: -1 });
  return docs.map((d) => shape(d));
}

export async function patchOwn(user, id, data) {
  const resource = await Resource.findOne({ _id: id, owner: user._id });
  if (!resource) throw new ApiError(404, 'Resource not found');
  for (const k of ['title', 'description', 'subject', 'topic', 'difficulty', 'examType', 'format']) {
    if (data[k] !== undefined) resource[k] = typeof data[k] === 'string' ? data[k].trim() : data[k];
  }
  if (data.externalUrl !== undefined) {
    if (data.externalUrl && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(data.externalUrl)) {
      throw new ApiError(400, 'External URL must be a valid http(s) address');
    }
    if (data.externalUrl && resource.filePath) throw new ApiError(400, 'Resource already has a file; remove it to use a URL');
    resource.externalUrl = data.externalUrl;
    resource.urlVerified = false;
  }
  // Editing re-enters review unless admin.
  if (!isAdminRole(user.role) && resource.status === 'approved') resource.status = 'pending';
  await resource.save();
  return shape(resource);
}

export async function setArchived(user, id, archived) {
  const filter = isAdminRole(user.role) ? { _id: id } : { _id: id, owner: user._id };
  const resource = await Resource.findOne(filter);
  if (!resource) throw new ApiError(404, 'Resource not found');
  resource.status = archived ? 'archived' : isAdminRole(user.role) ? 'approved' : 'pending';
  await resource.save();
  return shape(resource);
}

export async function deleteOwn(user, id) {
  const filter = isAdminRole(user.role) ? { _id: id } : { _id: id, owner: user._id };
  const resource = await Resource.findOneAndDelete(filter);
  if (!resource) throw new ApiError(404, 'Resource not found');
  removeStoredFile(resource.filePath);
  await Bookmark.deleteMany({ resource: resource._id });
  await Recommendation.deleteMany({ resource: resource._id });
  return { id };
}

// ---------- Admin review ----------
export async function reviewQueue() {
  return Resource.find({ status: 'pending' }).populate('owner', 'name email').sort({ createdAt: 1 });
}

export async function review(user, id, { approve, note }) {
  const resource = await Resource.findById(id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  resource.status = approve ? 'approved' : 'rejected';
  resource.reviewNote = (note || '').slice(0, 500);
  resource.reviewedBy = user._id;
  resource.reviewedAt = new Date();
  await resource.save();
  return shape(resource);
}

// ---------- Student library ----------
export async function listLibrary(user, { q, subject, topic, difficulty, examType, format, status, bookmarked, sort = 'newest', page = 1, limit = 12 }) {
  const filter = {};
  if (user.role === 'student') filter.status = 'approved';
  else if (user.role === 'educator') filter.$or = [{ status: 'approved' }, { owner: user._id }];
  else if (status) filter.status = status; // admin may filter by review status
  if (subject) filter.subject = new RegExp(`^${subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (topic) filter.topic = new RegExp(topic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (difficulty) filter.difficulty = difficulty;
  if (examType) filter.examType = examType;
  if (format) filter.format = format;
  if (q) filter.$text = { $search: q };

  let query = Resource.find(filter).select('+filePath');
  if (q) query = query.select({ score: { $meta: 'textScore' } });
  if (sort === 'popular') query = query.sort({ bookmarkCount: -1, views: -1, createdAt: -1 });
  else if (q) query = query.sort({ score: { $meta: 'textScore' } });
  else query = query.sort({ createdAt: -1 });

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(48, Math.max(1, Number(limit) || 12));
  const [items, total] = await Promise.all([
    query.skip((p - 1) * l).limit(l).populate('owner', 'name').lean(),
    Resource.countDocuments(filter),
  ]);
  let marks = new Map();
  if (items.length) {
    const bm = await Bookmark.find({ user: user._id, resource: { $in: items.map((i) => i._id) } }).lean();
    marks = new Map(bm.map((b) => [b.resource.toString(), b]));
  }
  let shaped = items.map((r) => {
    const m = marks.get(r._id.toString());
    const hasFile = Boolean(r.filePath);
    delete r.filePath;
    return { ...r, hasFile, bookmarked: Boolean(m), completed: Boolean(m?.completed) };
  });
  if (bookmarked === 'true') shaped = shaped.filter((r) => r.bookmarked);
  return { items: shaped, page: p, limit: l, total };
}

export async function getResource(user, id) {
  const resource = await Resource.findById(id).populate('owner', 'name email');
  if (!resource) throw new ApiError(404, 'Resource not found');
  if (!canView(resource, user)) throw new ApiError(403, 'This material is pending review and not yet accessible');
  resource.views += 1;
  await resource.save();
  const bm = await Bookmark.findOne({ user: user._id, resource: resource._id }).lean();
  return shape(resource, { bookmarked: Boolean(bm), completed: Boolean(bm?.completed) });
}

export async function downloadFile(user, id) {
  const resource = await Resource.findById(id).select('+filePath');
  if (!resource || !resource.filePath) throw new ApiError(404, 'No file attached to this resource');
  if (!canView(resource, user)) throw new ApiError(403, 'This material is not yet accessible');
  assertLocalWritable();
  return resource;
}

// ---------- Bookmarks + completion ----------
export async function toggleBookmark(user, id) {
  const resource = await Resource.findById(id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  if (!canView(resource, user)) throw new ApiError(403, 'This material is not yet accessible');
  const existing = await Bookmark.findOne({ user: user._id, resource: resource._id });
  if (existing) {
    if (existing.completed) {
      resource.completedCount = Math.max(0, resource.completedCount - 1);
      await resource.save();
    }
    resource.bookmarkCount = Math.max(0, resource.bookmarkCount - 1);
    await resource.save();
    await existing.deleteOne();
    return { bookmarked: false };
  }
  await Bookmark.create({ user: user._id, resource: resource._id });
  resource.bookmarkCount += 1;
  await resource.save();
  return { bookmarked: true };
}

export async function listBookmarks(user) {
  const marks = await Bookmark.find({ user: user._id }).populate({ path: 'resource', populate: { path: 'owner', select: 'name' } }).sort({ createdAt: -1 });
  return marks
    .filter((b) => b.resource && (user.role !== 'student' || b.resource.status === 'approved'))
    .map((b) => {
      const r = b.resource.toObject();
      delete r.filePath;
      return { ...b.toObject(), resource: { ...r, hasFile: false } };
    });
}

export async function setCompleted(user, id, completed) {
  const bm = await Bookmark.findOne({ user: user._id, resource: id });
  if (!bm) throw new ApiError(404, 'Bookmark this resource before marking it complete');
  const resource = await Resource.findById(id);
  if (!resource || !canView(resource, user)) throw new ApiError(403, 'This material is not accessible');
  if (bm.completed !== completed) {
    bm.completed = completed;
    bm.completedAt = completed ? new Date() : null;
    await bm.save();
    resource.completedCount = Math.max(0, resource.completedCount + (completed ? 1 : -1));
    await resource.save();
  }
  return { completed: bm.completed };
}

// ---------- Recommendations (rule-v1, persisted records) ----------
async function studentContext(user) {
  const [profile, topics, diags, plans] = await Promise.all([
    StudentProfile.findOne({ user: user._id }).lean(),
    Topic.find({ user: user._id }).lean(),
    Diagnostic.find({ user: user._id, submitted: true }).sort({ createdAt: -1 }).lean(),
    StudyPlan.find({ user: user._id, status: 'active' }).select('_id').lean(),
  ]);
  let planTopics = [];
  if (plans.length) {
    const tasks = await PlanTask.find({ plan: { $in: plans.map((p) => p._id) }, status: 'pending' })
      .populate('topic', 'title')
      .limit(60)
      .lean();
    planTopics = [...new Set(tasks.map((t) => norm(t.topic?.title)).filter(Boolean))];
  }
  const weakTopics = [
    ...new Set(
      topics.filter((t) => t.confidence <= 2 || t.difficulty === 'hard').map((t) => norm(t.title)).filter(Boolean)
    ),
  ].slice(0, 20);
  const beginnerSubjects = new Set(
    diags.filter((d) => d.level === 'beginner').map((d) => norm(d.subjectName)).filter(Boolean)
  );
  const level = diags[0]?.level || 'beginner';
  return {
    subjects: new Set([...(profile?.subjects || []).map(norm), ...topics.map((t) => norm(t.subject))].filter(Boolean)),
    weakTopics,
    planTopics,
    beginnerSubjects,
    examType: norm(profile?.examType),
    learningStyle: profile?.learningStyle || 'mixed',
    level,
  };
}

export async function recommendations(user, { limit = 10 } = {}) {
  if (user.role !== 'student' && !isAdminRole(user.role)) {
    throw new ApiError(403, 'Recommendations are built for students');
  }
  const ctx = await studentContext(user);
  const pool = await Resource.find({ status: 'approved' }).select('+filePath').sort({ bookmarkCount: -1 }).limit(200).lean();
  const ranked = rankResources(pool, ctx).slice(0, Math.min(20, Math.max(1, Number(limit) || 10)));
  // Persist records (cap history per student).
  await Recommendation.deleteMany({ user: user._id, ranker: RANKER_VERSION });
  if (ranked.length) {
    await Recommendation.insertMany(
      ranked.map((r, i) => ({
        user: user._id,
        resource: r.resource._id,
        score: r.score,
        reasons: r.reasons,
        context: `plan-topics:${ctx.planTopics.length},weak:${ctx.weakTopics.length}`,
        ranker: RANKER_VERSION,
      }))
    );
  }
  const marks = new Set(
    (await Bookmark.find({ user: user._id, resource: { $in: ranked.map((r) => r.resource._id) } }).select('resource').lean())
      .map((b) => b.resource.toString())
  );
  return {
    ranker: RANKER_VERSION,
    items: ranked.map((r, i) => {
      const hasFile = Boolean(r.resource.filePath);
      const { filePath: _omit, ...rest } = r.resource;
      return { rank: i + 1, score: r.score, reasons: r.reasons, bookmarked: marks.has(r.resource._id.toString()), resource: { ...rest, hasFile } };
    }),
  };
}
