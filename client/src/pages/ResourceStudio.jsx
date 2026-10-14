import { useEffect, useState } from 'react';
import { submitResource, listMine, patchResource, archiveResource, unarchiveResource, deleteResource, FORMATS, DIFFICULTIES, EXAM_TYPES, STATUS_STYLE } from '../api/resources';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

const blank = { title: '', description: '', subject: '', topic: '', difficulty: 'beginner', examType: 'other', format: 'note', externalUrl: '' };

export default function ResourceStudio() {
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await listMine();
      setMine(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.subject.trim()) return setMsg('Title and subject are required');
    if (!file && !form.externalUrl.trim()) return setMsg('Attach a file (PDF/TXT/MD/PNG/JPG, ≤10 MB) or paste an external URL');
    if (file && form.externalUrl.trim()) return setMsg('Provide either a file or a URL, not both');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
    if (file) fd.append('file', file);
    try {
      setMsg('Submitting…');
      const res = await submitResource(fd);
      setMsg(res.message);
      setForm(blank);
      setFile(null);
      load();
    } catch (err) {
      setMsg(getApiMessage(err, 'Submission failed'));
    }
  };

  const saveEdit = async (id, patch) => {
    try {
      await patchResource(id, patch);
      setEditing(null);
      load();
    } catch (err) {
      setMsg(getApiMessage(err, 'Update failed'));
    }
  };

  if (loading) return <Loading label="Loading studio…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Educator studio</h2>
        <p className="text-sm text-slate-500">Upload notes/PDFs or share video/article links. Admins review before students see them.</p>
      </div>

      <form onSubmit={submit} className="card space-y-3">
        <h3 className="font-semibold">Submit material</h3>
        <input className="input" value={form.title} onChange={set('title')} placeholder="Title — e.g. Thermodynamics one-shot notes" />
        <textarea className="input" rows="2" value={form.description} onChange={set('description')} placeholder="What does this cover? (optional)" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" value={form.subject} onChange={set('subject')} placeholder="Subject — e.g. Physics" />
          <input className="input" value={form.topic} onChange={set('topic')} placeholder="Topic (optional)" />
          <select className="input" value={form.format} onChange={set('format')}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="input" value={form.difficulty} onChange={set('difficulty')}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input" value={form.examType} onChange={set('examType')} placeholder="Exam">
            {EXAM_TYPES.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
          </select>
          <input className="input" value={form.externalUrl} onChange={set('externalUrl')} placeholder="External URL (https://…) — or attach a file" />
        </div>
        <input type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
        <button className="btn-primary w-full">Submit for review</button>
      </form>

      <div className="card">
        <h3 className="font-semibold">My materials ({mine.length})</h3>
        {mine.length === 0 ? (
          <div className="mt-2"><Empty title="Nothing submitted yet" hint="Your first upload will appear here with its review status." /></div>
        ) : (
          <ul className="mt-2 space-y-2">
            {mine.map((m) => (
              <li key={m._id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{m.title}</b>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${STATUS_STYLE[m.status]}`}>{m.status}</span>
                  <span className="text-slate-500">👁 {m.views} · 🔖 {m.bookmarkCount}</span>
                </div>
                {m.reviewNote && <p className="mt-1 text-xs text-slate-500">Reviewer: {m.reviewNote}</p>}
                {editing === m._id ? (
                  <EditForm initial={m} onCancel={() => setEditing(null)} onSave={(patch) => saveEdit(m._id, patch)} />
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(m._id)}>Edit</button>
                    {m.status !== 'archived' ? (
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={async () => { await archiveResource(m._id); load(); }}>Archive</button>
                    ) : (
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={async () => { await unarchiveResource(m._id); load(); }}>Restore</button>
                    )}
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={async () => { if (confirm('Delete this material?')) { await deleteResource(m._id); load(); } }}>Delete</button>
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

function EditForm({ initial, onCancel, onSave }) {
  const [f, setF] = useState({ title: initial.title, description: initial.description || '', subject: initial.subject, topic: initial.topic || '', difficulty: initial.difficulty, examType: initial.examType, format: initial.format });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mt-2 grid gap-2">
      <input className="input" value={f.title} onChange={set('title')} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" value={f.subject} onChange={set('subject')} />
        <input className="input" value={f.topic} onChange={set('topic')} placeholder="Topic" />
        <select className="input" value={f.difficulty} onChange={set('difficulty')}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <select className="input" value={f.format} onChange={set('format')}>{FORMATS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
      </div>
      <p className="text-xs text-slate-500">Note: editing an approved item sends it back for review.</p>
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1 text-xs" onClick={() => onSave(f)}>Save</button>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
