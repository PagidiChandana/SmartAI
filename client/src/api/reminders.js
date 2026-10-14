import client from './client';

export const listReminders = (params) => client.get('/notifications/reminders', { params }).then((r) => r.data);
export const createReminder = (payload) => client.post('/notifications/reminders', payload).then((r) => r.data);
export const patchReminder = (id, payload) => client.patch(`/notifications/reminders/${id}`, payload).then((r) => r.data);
export const setReminderStatus = (id, status) => client.post(`/notifications/reminders/${id}/status`, { status }).then((r) => r.data);
export const deleteReminder = (id) => client.delete(`/notifications/reminders/${id}`).then((r) => r.data);
export const reminderPrefs = () => client.get('/notifications/reminders/preferences').then((r) => r.data);
export const saveReminderPrefs = (payload) => client.put('/notifications/reminders/preferences', payload).then((r) => r.data);

export const REMINDER_TYPES = ['task', 'exam', 'session', 'custom'];
export const STATUS_STYLE = {
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-slate-200 text-slate-600',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-200 text-slate-500',
  done: 'bg-purple-100 text-purple-700',
  missed: 'bg-red-100 text-red-700',
};

// Local datetime-local value -> ISO UTC string for the API.
export const toISO = (local) => (local ? new Date(local).toISOString() : '');
// UTC ISO -> datetime-local value for editing.
export const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
