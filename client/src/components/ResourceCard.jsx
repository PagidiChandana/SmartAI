import { Link } from 'react-router-dom';
import { STATUS_STYLE } from '../api/resources';

const FORMAT_ICON = { pdf: '📄', note: '📝', article: '📰', video: '🎬', link: '🔗', other: '📦' };

export default function ResourceCard({ resource, reasons, onBookmark, compact = false }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{FORMAT_ICON[resource.format] || '📦'}</span>
        <div className="flex gap-1.5">
          {resource.status !== 'approved' && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${STATUS_STYLE[resource.status]}`}>
              {resource.status}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600">
            {resource.difficulty}
          </span>
        </div>
      </div>
      <Link to={`/library/${resource._id}`} className="font-semibold hover:text-brand-700">
        {resource.title}
      </Link>
      {!compact && resource.description && <p className="line-clamp-2 text-sm text-slate-500">{resource.description}</p>}
      <p className="text-xs text-slate-500">
        {resource.subject}{resource.topic ? ` · ${resource.topic}` : ''} · {resource.format} · 👁 {resource.views || 0} · 🔖 {resource.bookmarkCount || 0}
      </p>
      {reasons?.length > 0 && (
        <ul className="rounded-xl bg-brand-50 p-2 text-xs text-brand-700 ring-1 ring-brand-500/20">
          <li className="font-bold">Why this?</li>
          {reasons.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      )}
      <div className="mt-auto flex gap-2 pt-1">
        <Link to={`/library/${resource._id}`} className="btn-ghost text-sm">Open</Link>
        {onBookmark && (
          <button onClick={() => onBookmark(resource)} className="btn-ghost text-sm">
            {resource.bookmarked ? '★ Saved' : '☆ Save'}
          </button>
        )}
      </div>
    </div>
  );
}
