import { Reminder, REMINDER_TYPES } from '../models/Reminder.js';
import { Notification } from '../models/Notification.js';
import { prefsFor, typeEnabled, ReminderPrefs } from '../models/ReminderPrefs.js';
import { ApiError } from '../utils/ApiError.js';

const MISSED_AFTER_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;

function parseScheduledAt(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'scheduledAt must be a valid ISO-8601 date');
  return d;
}

export async function listReminders(user, { status, upcoming } = {}) {
  const filter = { user: user._id };
  if (status) {
    if (!['scheduled', 'sent', 'cancelled', 'done', 'missed'].includes(status)) throw new ApiError(400, 'Invalid status');
    filter.status = status;
  }
  if (upcoming === 'true') {
    filter.status = 'scheduled';
    filter.scheduledAt = { $gte: new Date() };
  }
  return Reminder.find(filter).sort({ scheduledAt: 1 }).limit(100).lean();
}

export async function createReminder(user, data) {
  if (!data.title?.trim()) throw new ApiError(400, 'Title is required');
  if (data.type && !REMINDER_TYPES.includes(data.type)) throw new ApiError(400, 'Invalid reminder type');
  const scheduledAt = parseScheduledAt(data.scheduledAt);
  if (scheduledAt <= new Date()) throw new ApiError(400, 'scheduledAt must be in the future');
  if (data.refKind && data.refKind !== 'none' && !data.refId) throw new ApiError(400, 'refId is required when refKind is set');
  return Reminder.create({
    user: user._id,
    title: data.title.trim().slice(0, 200),
    body: (data.body || '').slice(0, 2000),
    type: data.type || 'custom',
    refKind: data.refKind || 'none',
    refId: (data.refId || '').slice(0, 100),
    scheduledAt,
  });
}

export async function patchReminder(user, id, data) {
  const r = await Reminder.findOne({ _id: id, user: user._id });
  if (!r) throw new ApiError(404, 'Reminder not found');
  if (r.status !== 'scheduled') throw new ApiError(400, `Only scheduled reminders can be edited (status: ${r.status})`);
  if (data.title !== undefined) {
    if (!data.title.trim()) throw new ApiError(400, 'Title cannot be empty');
    r.title = data.title.trim().slice(0, 200);
  }
  if (data.body !== undefined) r.body = String(data.body).slice(0, 2000);
  if (data.scheduledAt !== undefined) {
    const d = parseScheduledAt(data.scheduledAt);
    if (d <= new Date()) throw new ApiError(400, 'scheduledAt must be in the future');
    r.scheduledAt = d;
  }
  await r.save();
  return r.toObject();
}

export async function setReminderStatus(user, id, status) {
  if (!['cancelled', 'done'].includes(status)) throw new ApiError(400, 'Status must be cancelled or done');
  const r = await Reminder.findOne({ _id: id, user: user._id });
  if (!r) throw new ApiError(404, 'Reminder not found');
  if (r.status !== 'scheduled') throw new ApiError(400, `Only scheduled reminders can be updated (status: ${r.status})`);
  r.status = status;
  await r.save();
  return r.toObject();
}

export async function deleteReminder(user, id) {
  const r = await Reminder.findOneAndDelete({ _id: id, user: user._id });
  if (!r) throw new ApiError(404, 'Reminder not found');
  return { id };
}

export async function getPrefs(user) {
  const prefs = await prefsFor(user._id);
  return { ...prefs, _id: prefs._id || null };
}

export async function setPrefs(user, data) {
  const patch = {};
  for (const k of ['taskReminders', 'examReminders', 'sessionReminders', 'customReminders']) {
    if (data[k] !== undefined) {
      if (typeof data[k] !== 'boolean') throw new ApiError(400, `${k} must be boolean`);
      patch[k] = data[k];
    }
  }
  if (data.leadMinutes !== undefined) {
    if (!Number.isInteger(data.leadMinutes) || data.leadMinutes < 0 || data.leadMinutes > 1440) {
      throw new ApiError(400, 'leadMinutes must be an integer 0-1440');
    }
    patch.leadMinutes = data.leadMinutes;
  }
  return ReminderPrefs.findOneAndUpdate({ user: user._id }, patch, { new: true, upsert: true }).lean();
}

/**
 * Scheduler tick: deliver due reminders exactly once.
 * - Atomic claim (status scheduled→sending) prevents duplicate delivery
 *   across overlapping ticks or multiple server instances.
 * - Preference-disabled types are cancelled, never delivered.
 * - Items >24h overdue become 'missed' (sweep) instead of firing late.
 * Returns counts for monitoring. `now` is injectable for tests.
 */
export async function processDueReminders({ now = new Date(), limit = BATCH } = {}) {
  const due = await Reminder.find({ status: 'scheduled', scheduledAt: { $lte: now } })
    .sort({ scheduledAt: 1 })
    .limit(limit)
    .select('_id');
  let sent = 0;
  let missed = 0;
  let skipped = 0;
  for (const { _id } of due) {
    const claimed = await Reminder.findOneAndUpdate(
      { _id, status: 'scheduled' },
      { status: 'sending' },
      { new: true }
    );
    if (!claimed) continue; // claimed by another tick — no duplicate delivery
    try {
      if (now - claimed.scheduledAt > MISSED_AFTER_MS) {
        claimed.status = 'missed';
        await claimed.save();
        missed += 1;
        continue;
      }
      const prefs = await prefsFor(claimed.user);
      if (!typeEnabled(prefs, claimed.type)) {
        claimed.status = 'cancelled';
        await claimed.save();
        skipped += 1;
        continue;
      }
      await Notification.create({
        user: claimed.user,
        kind: 'reminder',
        title: `⏰ ${claimed.title}`,
        body: claimed.body || `Scheduled for ${claimed.scheduledAt.toISOString()}`,
      });
      claimed.status = 'sent';
      claimed.sentAt = now;
      await claimed.save();
      sent += 1;
    } catch {
      // Release the claim so a later tick retries instead of losing it.
      await Reminder.findOneAndUpdate({ _id, status: 'sending' }, { status: 'scheduled' });
    }
  }
  return { checked: due.length, sent, missed, skipped };
}

export function pushStatus() {
  const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  return {
    configured,
    message: configured
      ? 'VAPID keys present but no push provider is wired — delivery NOT VERIFIED'
      : 'Push delivery is not configured. Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT and integrate a provider; in-app reminders work without it.',
  };
}
