import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { educatorOverview, educatorProfile, updateEducatorProfile } from '../api/educator';
import { publicTaxonomy } from '../api/notifications';
import { getApiMessage } from '../utils/validation';

export default function EducatorDashboard() {
  const { user, loading } = useAuth();
  const [ov, setOv] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState({ bio: '', teachingSubjects: '' });
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    Promise.all([
      educatorOverview().catch(() => ({ data: null })),
      educatorProfile().catch(() => ({ data: null })),
      publicTaxonomy().catch(() => ({ data: { subjects: [] } })),
    ]).then(([o, p, t]) => {
      setOv(o.data);
      if (p.data) {
        setProfile(p.data);
        setForm({ bio: p.data.bio || '', teachingSubjects: (p.data.teachingSubjects || []).join(', ') });
      }
      setSubjects(t.data?.subjects || []);
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await updateEducatorProfile({
        bio: form.bio,
        teachingSubjects: form.teachingSubjects.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setProfile(res.data);
      setEditing(false);
      setMsg('Profile saved ✓');
    } catch (err) {
      setMsg(getApiMessage(err, 'Save failed'));
    }
  };

  if (loading) return <Loading label="Loading dashboard…" />;

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Educator dashboard</h2>
        <p className="text-sm text-slate-500">Welcome, {user?.name} — students, tests, materials and feedback.</p>
      </div>

      {ov && (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="card"><p className="text-sm text-slate-500">Students</p><p className="text-2xl font-bold">{ov.students}</p></div>
          <div className="card"><p className="text-sm text-slate-500">Assessments</p><p className="text-2xl font-bold">{ov.assessments}</p></div>
          <div className="card"><p className="text-sm text-slate-500">Attempts</p><p className="text-2xl font-bold">{ov.attempts}</p></div>
          <div className="card"><p className="text-sm text-slate-500">To grade</p><p className="text-2xl font-bold">{ov.pendingGrading}</p></div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/educator/students" className="card hover:ring-brand-500/40">
          <h3 className="font-bold">My students →</h3>
          <p className="text-sm text-slate-500">Progress, weak topics, feedback notes.</p>
        </Link>
        <Link to="/educator/assessments" className="card hover:ring-brand-500/40">
          <h3 className="font-bold">Tests & assignments →</h3>
          <p className="text-sm text-slate-500">Create, publish, grade and analyze.</p>
        </Link>
        <Link to="/studio" className="card hover:ring-brand-500/40">
          <h3 className="font-bold">Learning materials →</h3>
          <p className="text-sm text-slate-500">Upload notes and share links for review.</p>
        </Link>
        <Link to="/educator/class" className="card hover:ring-brand-500/40">
          <h3 className="font-bold">Class performance →</h3>
          <p className="text-sm text-slate-500">Averages and topics needing support.</p>
        </Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Teaching profile</h3>
          <button className="btn-ghost text-sm" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit'}</button>
        </div>
        {editing ? (
          <form onSubmit={save} className="mt-3 space-y-3">
            <div>
              <label className="label">Bio</label>
              <textarea className="input" rows="2" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Your background and teaching focus…" />
            </div>
            <div>
              <label className="label">Teaching subjects (comma separated)</label>
              <input className="input" value={form.teachingSubjects} onChange={(e) => setForm({ ...form, teachingSubjects: e.target.value })} placeholder="Physics, Maths" list="subject-list" />
              <datalist id="subject-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            {msg && <p className="text-sm text-slate-600">{msg}</p>}
            <button className="btn-primary">Save profile</button>
          </form>
        ) : (
          <div className="mt-2 text-sm text-slate-600">
            <p>{profile?.bio || 'No bio yet.'}</p>
            <p className="mt-1">Subjects: {(profile?.teachingSubjects || []).join(', ') || '—'}</p>
            {msg && <p className="mt-1">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
