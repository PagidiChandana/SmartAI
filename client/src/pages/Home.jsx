import { Link } from 'react-router-dom';
import { useHealth } from '../hooks/useHealth';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';

const roadmap = [
  { title: 'AI Study Planner', desc: 'Generate day-wise plans from syllabus + deadline.', to: '/plans' },
  { title: 'AI Tutor & Library', desc: 'Ask doubts with cited sources, browse educator materials.', to: '/library' },
  { title: 'Tests & Analytics', desc: 'Timed assessments, grading, progress insights.', to: '/assessments' },
  { title: 'PDF & Notes Upload', desc: 'Syllabus extraction with Multer, keyword retrieval.', to: '/setup' },
];

export default function Home() {
  const health = useHealth();

  return (
    <div className="space-y-6">
      <section className="card bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-0">
          <h1 className="text-3xl font-bold">StudyAI – Personalized Learning & Study Planner</h1>
        <p className="mt-2 max-w-2xl text-white/85">
          Setup wizard, AI study plans, library, tutor, timed tests and analytics —
          check the API status below, then pick a module to explore.
        </p>
        <div className="mt-4 flex gap-2">
          <Link to="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700">
            Start learning
          </Link>
          <Link to="/dashboard" className="rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-white/50">
            View dashboard
          </Link>
        </div>
      </section>

      <section>
        {health.status === 'loading' && <Loading label="Checking API health…" />}
        {health.status === 'error' && <ErrorState message={`API unreachable: ${health.error}`} />}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {roadmap.map((r) => (
          <Link key={r.title} to={r.to} className="card hover:ring-brand-500/40">
            <h3 className="font-semibold">{r.title} →</h3>
            <p className="mt-1 text-sm text-slate-500">{r.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
