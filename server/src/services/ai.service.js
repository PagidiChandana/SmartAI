import { env } from '../config/env.js';

/**
 * Configurable LLM provider. Phase 1 = mock-safe foundation.
 * Set AI_PROVIDER=openai|gemini|ollama and provide keys to go live later.
 * Ollama runs locally (no API key): install Ollama, `ollama pull <model>`,
 * `ollama serve`, then AI_PROVIDER=ollama.
 * All future features (planner, quiz, summarizer) call generateText().
 */
export async function generateText(prompt, { system = 'You are StudyAI, a helpful study coach.' } = {}) {
  const provider = env.aiProvider;

  if (provider === 'openai') {
    if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'gemini') {
    if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY missing');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  if (provider === 'ollama') {
    const res = await fetch(`${env.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.ollamaModel,
        system,
        prompt,
        stream: false,
        options: { temperature: 0.7 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} (is 'ollama serve' running?)`);
    const data = await res.json();
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    return data.response ?? '';
  }

  // mock fallback — deterministic, works offline, perfect for foundation phase
  return `[mock:${provider}] ${system} :: ${prompt}`.slice(0, 2000);
}

/**
 * Structured-JSON generation for features like the study planner.
 * - openai: uses response_format json_object when `json` is true.
 * - mock / missing keys: throws so callers use their deterministic fallback.
 * Keys never leave the server — the browser only sees validated results.
 */
export async function generateJSON(prompt, { system = 'You are StudyAI. Reply with valid JSON only.', json = true } = {}) {
  const provider = env.aiProvider;
  if (provider === 'openai') {
    if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
  // gemini + mock: route through generateText so provider logic stays in one place.
  // Mock has no real model — throw to trigger the caller's rule-based fallback.
  if (provider === 'mock') throw new Error('AI provider is mock; using rule-based fallback');
  if (provider === 'ollama') {
    const res = await fetch(`${env.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.ollamaModel,
        system,
        prompt,
        stream: false,
        format: json ? 'json' : undefined,
        options: { temperature: 0.3 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} (is 'ollama serve' running?)`);
    const data = await res.json();
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    return data.response ?? '';
  }
  return generateText(prompt, { system });
}

/** Extract the first {...} JSON block from model output (strips code fences). */
export function extractJSON(raw) {
  if (!raw) throw new Error('Empty AI response');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in AI response');
  return JSON.parse(candidate.slice(start, end + 1));
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/**
 * Multi-turn chat with request timeout. `messages` = [{role, content}].
 * Throws on mock provider / missing keys / timeout so callers fall back.
 */
export async function generateChat(messages, { system = 'You are StudyAI, a helpful study coach.', timeoutMs = 60000 } = {}) {
  const provider = env.aiProvider;
  if (provider === 'openai') {
    if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
    const t = withTimeout(timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
        body: JSON.stringify({ model: env.openaiModel, messages: [{ role: 'system', content: system }, ...messages], temperature: 0.6 }),
        signal: t.signal,
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`AI request timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      t.done();
    }
  }
  if (provider === 'gemini') {
    if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY missing');
    const t = withTimeout(timeoutMs);
    try {
      const turns = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${turns}` }] }] }),
          signal: t.signal,
        }
      );
      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`AI request timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      t.done();
    }
  }
  if (provider === 'ollama') {
    const t = withTimeout(timeoutMs);
    try {
      const res = await fetch(`${env.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.ollamaModel,
          messages: [{ role: 'system', content: system }, ...messages],
          stream: false,
          options: { temperature: 0.6 },
        }),
        signal: t.signal,
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status} (is 'ollama serve' running?)`);
      const data = await res.json();
      if (data.error) throw new Error(`Ollama error: ${data.error}`);
      return data.message?.content ?? '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`AI request timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      t.done();
    }
  }
  throw new Error('AI provider is mock; using tutor fallback');
}

/**
 * Token streaming for the tutor SSE endpoint. Yields {delta} chunks then
 * {done:true}. OpenAI streams real tokens; other providers yield the full
 * text as one chunk (same content, no fake per-token animation).
 */
export async function* streamChat(messages, { system, timeoutMs = 60000 } = {}) {
  const provider = env.aiProvider;
  if (provider === 'openai') {
    if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
    const t = withTimeout(timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
        body: JSON.stringify({ model: env.openaiModel, messages: [{ role: 'system', content: system }, ...messages], temperature: 0.6, stream: true }),
        signal: t.signal,
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString('utf-8');
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') {
            yield { done: true };
            return;
          }
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta) yield { delta };
          } catch {
            // ignore partial JSON frames
          }
        }
      }
      yield { done: true };
    } finally {
      t.done();
    }
    return;
  }
  if (provider === 'ollama') {
    const t = withTimeout(timeoutMs);
    try {
      const res = await fetch(`${env.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.ollamaModel,
          messages: [{ role: 'system', content: system }, ...messages],
          stream: true,
          options: { temperature: 0.6 },
        }),
        signal: t.signal,
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status} (is 'ollama serve' running?)`);
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString('utf-8');
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s) continue;
          try {
            const obj = JSON.parse(s);
            if (obj.error) throw new Error(`Ollama error: ${obj.error}`);
            const delta = obj.message?.content;
            if (delta) yield { delta };
            if (obj.done) {
              yield { done: true };
              return;
            }
          } catch (err) {
            if (err.message?.startsWith('Ollama error:')) throw err;
            // ignore partial JSON frames
          }
        }
      }
      yield { done: true };
    } finally {
      t.done();
    }
    return;
  }
  const full = await generateChat(messages, { system, timeoutMs });
  yield { delta: full };
  yield { done: true };
}
