import { useState } from 'react';
import { Link } from 'react-router-dom';
import { voteMessage } from '../api/tutor';

// Lightweight safe formatter: code fences, inline code, bold, math spans,
// numbered/bulleted lines. No raw HTML is ever injected (React escapes text).
function renderInline(text, keyPrefix) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\$[^$]+\$)/g);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return <code key={key} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-amber-200">{p.slice(1, -1)}</code>;
    }
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={key}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
      return <span key={key} className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-sm text-purple-800" title="Math expression">{p.slice(1, -1)}</span>;
    }
    return <span key={key}>{p}</span>;
  });
}

export function FormattedText({ text }) {
  const blocks = text.split(/```/);
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (i % 2 === 1) {
          const [lang, ...rest] = b.split('\n');
          return (
            <pre key={i} className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
              {lang.trim() && <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{lang.trim()}</div>}
              <code>{rest.join('\n').trim()}</code>
            </pre>
          );
        }
        return (
          <div key={i} className="space-y-1">
            {b.split('\n').map((line, j) => {
              const t = line.trim();
              if (/^#{1,4}\s/.test(t)) return <p key={j} className="font-bold">{renderInline(t.replace(/^#{1,4}\s/, ''), `${i}-${j}`)}</p>;
              if (/^(\d+[.)]|[-*])\s+/.test(t)) return <p key={j} className="pl-4">• {renderInline(t.replace(/^(\d+[.)]|[-*])\s+/, ''), `${i}-${j}`)}</p>;
              return <p key={j}>{renderInline(line, `${i}-${j}`)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function ChatMessage({ message, onVoted }) {
  const [voted, setVoted] = useState(message.vote || null);
  const isUser = message.role === 'user';

  const vote = async (v) => {
    try {
      await voteMessage(message._id, v);
      setVoted(v);
      onVoted?.();
    } catch {
      // non-critical; vote stays local-only on failure
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm bg-white px-4 py-3 ring-1 ring-slate-200">
        {message.fallback && (
          <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            AI unavailable — guidance + retrieved sources below
          </p>
        )}
        <FormattedText text={message.content} />
        {message.sources?.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
            <p className="text-xs font-bold text-slate-500">📚 Sources (retrieved from approved materials)</p>
            {message.sources.map((s, i) => (
              <p key={i} className="mt-1 text-xs text-slate-600">
                <span className="font-semibold">{i + 1}. {s.title}</span>
                {s.snippet && <span className="text-slate-500"> — {s.snippet.slice(0, 140)}</span>}
              </p>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-400">Was this helpful?</span>
          <button
            aria-label="Mark helpful"
            onClick={() => vote('helpful')}
            className={`rounded-full px-2 py-0.5 text-xs ring-1 ${voted === 'helpful' ? 'bg-green-600 text-white ring-green-600' : 'ring-slate-200 text-slate-500'}`}
          >
            👍 Yes
          </button>
          <button
            aria-label="Mark unhelpful"
            onClick={() => vote('unhelpful')}
            className={`rounded-full px-2 py-0.5 text-xs ring-1 ${voted === 'unhelpful' ? 'bg-red-500 text-white ring-red-500' : 'ring-slate-200 text-slate-500'}`}
          >
            👎 No
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourceLink({ title }) {
  return <Link to="/library" className="underline">{title}</Link>;
}
