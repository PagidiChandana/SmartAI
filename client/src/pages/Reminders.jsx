import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listReminders, createReminder, patchReminder, setReminderStatus,
  deleteReminder, reminderPrefs, saveReminderPrefs,
  REMINDER_TYPES, STATUS_STYLE, toISO, toLocal,
} from '../api/reminders';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

const blank = { title: '', body: '', type: 'task', scheduledAt: '' };

export default function Reminders() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [msg, setMsg] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);

  const load = async (f = filter) => {
    try {
      const [r, p] = await Promise.all([
        listReminders(f ? { status: f } : {}),
        reminderPrefs().catch(() => ({ data: null })),
      ]);
      setItems(r.data);
      setPrefs(p.data);
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not load reminders'));
    }
  };

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduledAt) {
      setMsg('Title and date/time are required');
      return;
    }
    try {
      if (editing) {
        await patchReminder(editing, { title: form.title, body: form.body, scheduledAt: toISO(form.scheduledAt) });
        setEditing(null);
        setMsg('Reminder updated ✓');
      } else {
        await createReminder({ ...form, scheduledAt: toISO(form.scheduledAt) });
        setMsg('Reminder scheduled ✓ — arrives in your inbox at the due time');
      }
      setForm(blank);
      load();
    } catch (err) {
      setMsg(getApiMessage(err, 'Save failed'));
    }
  };

  const startEdit = (r) => {
    setEditing(r._id);
    setForm({ title: r.title, body: r.body || '', type: r.type, scheduledAt: toLocal(r.scheduledAt) });
    window.scrollTo(0, 0);
  };

  const act = async (fn, ok) => {
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (err) {
      setMsg(getApiMessage(err, 'Action failed'));
    }
  };

  const savePrefs = async (patch) => {
    try {
      const res = await saveReminderPrefs({ ...prefs, ...patch });
      setPrefs(res.data);
      setMsg('Preferences saved ✓');
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not save preferences'));
    }
  };

  if (!items) return <Loading label="Loading reminders…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Reminders ⏰</h2>
          <p className="text-sm text-slate-500">Due reminders arrive in your <Link to="/inbox" className="font-semibold text-brand-600">inbox</Link>. Times shown in your local timezone.</p>
        </div>
        <button className="btn-ghost ml-auto text-sm" onClick={() => setShowPrefs(!showPrefs)}>
          {showPrefs ? 'Hide preferences' : 'Preferences ⚙'}
        </button>
      </div>

      {showPrefs && prefs && (
        <div className="card space-y-2">
          <h3 className="font-semibold">Reminder preferences</h3>
          {['task', 'exam', 'session', 'custom'].map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm capitalize">
              <input
                type="checkbox"
                checked={prefs[`${t}Reminders`] !== false}
                onChange={(e) => savePrefs({ [`${t}Reminders`]: e.target.checked })}
              />
              {t} reminders {prefs[`${t}Reminders`] === false && <span className="text-xs text-amber-600">(off — due items are cancelled, never delivered)</span>}
            </label>
          ))}
          <p className="text-xs text-slate-400">Push delivery is not configured in this build — reminders arrive in-app. See README for VAPID setup.</p>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-3">
        <h3 className="font-semibold">{editing ? 'Edit reminder' : 'New reminder'}</h3>
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title — e.g. Revise optics" required />
        <textarea className="input" rows="2" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details (optional)" />
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {REMINDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} required />
        </div>
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
        <div className="flex gap-2">
          <button className="btn-primary">{editing ? 'Save changes' : 'Schedule reminder'}</button>
          {editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          {['', 'scheduled', 'sent', 'done', 'missed', 'cancelled'].map((s) => (
            <button key={s} onClick={() => { setFilter(s); load(s); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>
              {s || 'all'}
            </button>
          ))}
        </div>
        {items.length === 0 ? (
          <div className="mt-3"><Empty title="No reminders here" hint="Schedule study, exam, or session reminders above — the server delivers them to your inbox." /></div>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((r) => (
              <li key={r._id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{r.title}</b>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] || 'bg-slate-100'}`}>{r.status}</span>
                  <span className="text-xs capitalize text-slate-500">{r.type} · due {new Date(r.scheduledAt).toLocaleString()}</span>
                </div>
                {r.body && <p className="mt-1 text-slate-600">{r.body}</p>}
                {r.status === 'scheduled' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => startEdit(r)}>Edit</button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(() => setReminderStatus(r._id, 'done'), 'Marked done ✓')}>Done ✓</button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(() => setReminderStatus(r._id, 'cancelled'), 'Cancelled')}>Cancel</button>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => act(() => deleteReminder(r._id), 'Deleted')}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
