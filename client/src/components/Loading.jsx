export default function Loading({ label = 'Loading…' }) {
  return (
    <div className="card flex items-center gap-3">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
