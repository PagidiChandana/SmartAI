import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listConversations, createConversation, getConversation,
  renameConversation, deleteConversation, askQuestion, askStream,
} from '../api/tutor';
import ChatMessage from '../components/ChatMessage';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

export default function Tutor() {
  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('tutor');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [streamSources, setStreamSources] = useState([]);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [streamOn, setStreamOn] = useState(true);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const res = await listConversations();
      setConvs(res.data);
      return res.data;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    loadList().then((list) => {
      if (list.length > 0) openChat(list[0]._id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const openChat = async (id) => {
    abortRef.current?.abort();
    setSending(false);
    setStreaming('');
    setError('');
    setActiveId(id);
    try {
      const res = await getConversation(id);
      setMessages(res.data.messages);
      setMode(res.data.conversation.mode || 'tutor');
    } catch (err) {
      setError(getApiMessage(err, 'Could not open chat'));
    }
  };

  const newChat = async () => {
    try {
      const res = await createConversation({ mode });
      setConvs((c) => [res.data, ...c]);
      setActiveId(res.data._id);
      setMessages([]);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Could not start chat'));
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    if (q.length > 2000) {
      setError('Question too long (max 2000 characters)');
      return;
    }
    let cid = activeId;
    if (!cid) {
      try {
        const res = await createConversation({ mode });
        cid = res.data._id;
        setConvs((c) => [res.data, ...c]);
        setActiveId(cid);
      } catch (err) {
        setError(getApiMessage(err, 'Could not start chat'));
        return;
      }
    }
    setInput('');
    setError('');
    setSending(true);
    setStreaming('');
    setStreamSources([]);
    // Optimistic user bubble.
    const tempUser = { _id: `tmp-${Date.now()}`, role: 'user', content: q };
    setMessages((m) => [...m, tempUser]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // 90s client timeout mirrors the 60s server timeout with headroom.
    const timeout = setTimeout(() => ctrl.abort(), 90000);

    try {
      if (!streamOn) {
        // Blocking mode: single validated answer, no SSE.
        await askQuestion(cid, { question: q, mode });
        const res = await getConversation(cid);
        setMessages(res.data.messages);
        loadList();
        return;
      }
      let acc = '';
      await askStream(cid, { question: q, mode }, (ev) => {
        if (ev.type === 'meta') {
          setStreamSources(ev.sources || []);
        } else if (ev.type === 'delta') {
          acc += ev.text;
          setStreaming(acc);
        } else if (ev.type === 'fallback') {
          acc = ev.text;
          setStreaming(acc);
        }
      }, ctrl.signal);
      // Replace optimistic stream with persisted history (has real IDs for votes).
      const res = await getConversation(cid);
      setMessages(res.data.messages);
      setStreaming('');
      setStreamSources([]);
      loadList();
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Try a shorter question or ask again.');
      } else {
        setError('Could not reach the tutor. Please retry.');
      }
      setStreaming('');
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  };

  const doRename = async (id) => {
    if (!renameText.trim()) return;
    try {
      await renameConversation(id, { title: renameText.trim() });
      setRenaming(null);
      loadList();
    } catch (err) {
      setError(getApiMessage(err, 'Rename failed'));
    }
  };

  const doDelete = async (id) => {
    if (!confirm('Delete this chat and its history?')) return;
    try {
      await deleteConversation(id);
      const rest = convs.filter((c) => c._id !== id);
      setConvs(rest);
      if (id === activeId) {
        setActiveId(rest[0]?._id || null);
        setMessages(rest[0] ? (await getConversation(rest[0]._id)).data.messages : []);
      }
    } catch (err) {
      setError(getApiMessage(err, 'Delete failed'));
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="card h-fit space-y-2 md:sticky md:top-20">
        <button className="btn-primary w-full" onClick={newChat}>+ New chat</button>
        {convs.length === 0 && <p className="text-sm text-slate-500">No chats yet.</p>}
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {convs.map((c) => (
            <li key={c._id} className={`rounded-xl px-2 py-1.5 text-sm ${c._id === activeId ? 'bg-brand-50 ring-1 ring-brand-500/30' : 'hover:bg-slate-50'}`}>
              {renaming === c._id ? (
                <div className="flex gap-1">
                  <input autoFocus className="input py-1 text-xs" value={renameText} onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRename(c._id)} />
                  <button className="btn-ghost px-2 text-xs" onClick={() => doRename(c._id)}>✓</button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button className="flex-1 truncate text-left" onClick={() => openChat(c._id)} title={c.title}>{c.title}</button>
                  <button aria-label={`Rename ${c.title}`} className="text-slate-400 hover:text-slate-700" onClick={() => { setRenaming(c._id); setRenameText(c.title); }}>✎</button>
                  <button aria-label={`Delete ${c.title}`} className="text-slate-400 hover:text-red-600" onClick={() => doDelete(c._id)}>🗑</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat panel */}
      <section className="card flex min-h-[70vh] flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold">AI Tutor 💬</h2>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-slate-500">
              <input type="checkbox" checked={mode === 'hint-first'} onChange={(e) => setMode(e.target.checked ? 'hint-first' : 'tutor')} />
              Hint-first 🧩
            </label>
            <label className="flex items-center gap-1 text-slate-500">
              <input type="checkbox" checked={streamOn} onChange={(e) => setStreamOn(e.target.checked)} />
              Stream
            </label>
          </div>
        </div>
        <p className="pt-2 text-xs text-slate-400">Answers cite only retrieved approved materials. Keyword retrieval (not vector search). Hint-first gives hints, not full solutions.</p>

        <div className="flex-1 space-y-3 overflow-y-auto py-4">
          {!activeId && messages.length === 0 && !sending && (
            <Empty title="Ask your first doubt" hint="Try: 'Explain photosynthesis step by step' — answers use your approved library when relevant." />
          )}
          {messages.map((m) => <ChatMessage key={m._id} message={m} />)}
          {(sending || streaming) && (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 ring-1 ring-slate-200">
                {streaming ? (
                  <div className="whitespace-pre-wrap text-sm">{streaming}<span className="animate-pulse">▍</span></div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:150ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:300ms]" /></span>
                    Tutor is thinking…
                  </p>
                )}
                {streamSources.length > 0 && <p className="mt-1 text-xs text-slate-400">📚 Using {streamSources.length} retrieved source(s)…</p>}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <form onSubmit={send} className="flex gap-2 border-t border-slate-100 pt-3">
          <label htmlFor="tutor-input" className="sr-only">Ask the tutor</label>
          <input
            id="tutor-input"
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'hint-first' ? 'Paste a practice problem for hints…' : 'Ask about any subject or topic…'}
            maxLength={2000}
            disabled={sending}
          />
          <button className="btn-primary" disabled={sending || !input.trim()}>
            {sending ? '…' : 'Ask'}
          </button>
        </form>
        {!streamOn && sending && <p className="text-xs text-slate-400">Streaming off — answer appears when complete.</p>}
      </section>
    </div>
  );
}
