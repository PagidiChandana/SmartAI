export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function RoleBadge({ role }) {
  const tone = role === 'super_admin' ? 'purple' : role === 'admin' ? 'blue' : role === 'educator' ? 'amber' : 'slate';
  return <Badge tone={tone}>{role === 'super_admin' ? 'Super Admin ★' : role}</Badge>;
}

export function StatusBadge({ status }) {
  return <Badge tone={status === 'active' || status === 'approved' || status === 'published' ? 'green' : status === 'suspended' || status === 'rejected' ? 'red' : status === 'pending' ? 'amber' : 'slate'}>{status}</Badge>;
}

export function Pager({ page, pages, total, onPage }) {
  return (
    <div className="flex items-center gap-3">
      <button className="btn-ghost text-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="text-sm text-slate-500">{total} · page {page}/{pages}</span>
      <button className="btn-ghost text-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button className="btn-ghost px-2 py-1 text-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
