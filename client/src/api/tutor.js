import client from './client';

export const listConversations = () => client.get('/tutor/conversations').then((r) => r.data);
export const createConversation = (payload) => client.post('/tutor/conversations', payload).then((r) => r.data);
export const getConversation = (id) => client.get(`/tutor/conversations/${id}`).then((r) => r.data);
export const renameConversation = (id, payload) => client.patch(`/tutor/conversations/${id}`, payload).then((r) => r.data);
export const deleteConversation = (id) => client.delete(`/tutor/conversations/${id}`).then((r) => r.data);
export const askQuestion = (id, payload) => client.post(`/tutor/conversations/${id}/messages`, payload).then((r) => r.data);
export const voteMessage = (messageId, vote) => client.patch(`/tutor/messages/${messageId}/vote`, { vote }).then((r) => r.data);

/**
 * Streaming ask over SSE. Auth: httpOnly cookie is sent automatically
 * (credentials: include). No token header — cookie-only sessions.
 */
export async function askStream(id, payload, onEvent, signal) {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/tutor/conversations/${id}/messages/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal,
    }
  );
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stream failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      try {
        onEvent(JSON.parse(line.slice(5)));
      } catch {
        // ignore malformed frames
      }
    }
  }
}
