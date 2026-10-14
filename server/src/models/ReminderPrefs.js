import mongoose from 'mongoose';

// Per-user reminder preferences. Absent document = all types enabled.
const reminderPrefsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    taskReminders: { type: Boolean, default: true },
    examReminders: { type: Boolean, default: true },
    sessionReminders: { type: Boolean, default: true },
    customReminders: { type: Boolean, default: true },
    leadMinutes: { type: Number, min: 0, max: 1440, default: 30 },
  },
  { timestamps: true }
);

export const ReminderPrefs = mongoose.model('ReminderPrefs', reminderPrefsSchema);

export async function prefsFor(userId) {
  let prefs = await ReminderPrefs.findOne({ user: userId }).lean();
  if (!prefs) prefs = { taskReminders: true, examReminders: true, sessionReminders: true, customReminders: true, leadMinutes: 30 };
  return prefs;
}

export function typeEnabled(prefs, type) {
  return prefs[`${type}Reminders`] !== false;
}
