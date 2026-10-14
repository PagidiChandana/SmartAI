import { processDueReminders } from './reminder.service.js';

let timer = null;

// Simple interval scheduler (60s). Adequate for in-app reminders without
// extra infrastructure. For multi-instance production, replace with a
// distributed lock or queue — the atomic claim in processDueReminders
// already makes concurrent ticks safe (no duplicates).
export function startScheduler({ intervalMs = 60000 } = {}) {
  if (timer || process.env.DISABLE_SCHEDULER === '1') return null;
  const tick = async () => {
    try {
      const r = await processDueReminders();
      if (r.sent + r.missed > 0) console.log(`reminders: sent=${r.sent} missed=${r.missed} skipped=${r.skipped}`);
    } catch (err) {
      console.error('reminder tick failed:', err.message);
    }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
