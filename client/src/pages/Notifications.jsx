import { useEffect, useState } from 'react';
import { inbox, markRead, markAllRead } from '../api/notifications';
import Loading from '../components/Loading';
import Empty from '../components/Empty';

export default function Notifications() {
  const [data, setData] = useState(null);

  const load = async () => {
    try {
      const res = await inbox();
      setData(res.data);
    } catch {
      setData({ items: [], unread: 0 });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const read = async (id) => {
    await markRead(id);
    load();
  };

  if (!data) return <Loading label="Loading inbox…" />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card flex items-center justify-between">
        <h2 className="text-xl font-bold">Inbox {data.unread > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">{data.unread}</span>}</h2>
        {data.unread > 0 && <button className="btn-ghost text-sm" onClick={async () => { await markAllRead(); load(); }}>Mark all read</button>}
      </div>
      {data.items.length === 0 ? (
        <Empty title="No messages" hint="Educator feedback and platform announcements appear here." />
      ) : (
        data.items.map((n) => (
          <div key={n._id} className={`card ${n.read ? '' : 'ring-brand-500/40'}`}>
            <div className="flex items-center gap-2">
              <b>{n.title}</b>
              <span className="text-xs capitalize text-slate-400">{n.kind}{n.from ? ` · from ${n.from.name}` : ''}</span>
            </div>
            {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{n.body}</p>}
            {!n.read && <button className="btn-ghost mt-2 text-xs" onClick={() => read(n._id)}>Mark read</button>}
          </div>
        ))
      )}
    </div>
  );
}
