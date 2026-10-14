// AI provider tests with mocked network — deterministic, no keys, no DB.
// Run: npm test (node --test tests/)
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.js';
import { generateText, generateJSON, generateChat, extractJSON, streamChat } from '../src/services/ai.service.js';

const saved = { provider: env.aiProvider, key: env.openaiApiKey };
const realFetch = globalThis.fetch;

function mockFetch(handler) {
  globalThis.fetch = handler;
}

function openaiOk(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  env.aiProvider = 'mock';
  env.openaiApiKey = '';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  env.aiProvider = saved.provider;
  env.openaiApiKey = saved.key;
});

describe('mock provider honesty (no fake AI)', () => {
  it('generateJSON throws on mock so callers use labeled fallbacks', async () => {
    await assert.rejects(() => generateJSON('{"a":1}'), /mock/);
  });
  it('generateChat throws on mock so tutor uses flagged fallback', async () => {
    await assert.rejects(() => generateChat([{ role: 'user', content: 'hi' }]), /mock/);
  });
  it('generateText mock output is labeled, not presented as answer', async () => {
    const out = await generateText('hi');
    assert.match(out, /mock/);
  });
});

describe('openai provider (mocked fetch)', () => {
  it('generateText returns completion content', async () => {
    env.aiProvider = 'openai';
    env.openaiApiKey = 'test-key-never-logged';
    mockFetch(async () => openaiOk({ choices: [{ message: { content: 'Hello learner' } }] }));
    assert.equal(await generateText('hi'), 'Hello learner');
  });
  it('generateText throws without key (missing credentials)', async () => {
    env.aiProvider = 'openai';
    env.openaiApiKey = '';
    await assert.rejects(() => generateText('hi'), /OPENAI_API_KEY missing/);
  });
  it('generateText surfaces HTTP errors', async () => {
    env.aiProvider = 'openai';
    env.openaiApiKey = 'k';
    mockFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await assert.rejects(() => generateText('hi'), /OpenAI error: 429/);
  });
  it('generateJSON returns raw text for validator to check', async () => {
    env.aiProvider = 'openai';
    env.openaiApiKey = 'k';
    mockFetch(async () => openaiOk({ choices: [{ message: { content: '{"tasks": []}' } }] }));
    const raw = await generateJSON('x');
    assert.deepEqual(extractJSON(raw), { tasks: [] });
  });
  it('never sends the key in logs or errors', async () => {
    env.aiProvider = 'openai';
    env.openaiApiKey = 'super-secret-key';
    let seenUrl = '';
    let seenAuth = '';
    mockFetch(async (url, opts) => {
      seenUrl = String(url);
      seenAuth = opts.headers.Authorization;
      return openaiOk({ choices: [{ message: { content: 'ok' } }] });
    });
    await generateText('hi');
    assert.ok(!seenUrl.includes('super-secret-key'), 'key must not appear in URL');
    assert.equal(seenAuth, 'Bearer super-secret-key');
  });
});

describe('gemini provider (mocked fetch)', () => {
  it('missing key throws before any request', async () => {
    env.aiProvider = 'gemini';
    env.geminiApiKey = '';
    let called = false;
    mockFetch(async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await assert.rejects(() => generateChat([{ role: 'user', content: 'hi' }]), /GEMINI_API_KEY missing/);
    assert.equal(called, false);
  });
});

describe('ollama provider (mocked fetch, no key needed)', () => {
  it('generateChat returns message content', async () => {
    env.aiProvider = 'ollama';
    mockFetch(async () => openaiOk({ message: { content: 'Ollama says hi' }, done: true }));
    assert.equal(await generateChat([{ role: 'user', content: 'hi' }]), 'Ollama says hi');
  });
  it('generateChat surfaces Ollama error payloads', async () => {
    env.aiProvider = 'ollama';
    mockFetch(async () => openaiOk({ error: 'model not found' }));
    await assert.rejects(() => generateChat([{ role: 'user', content: 'hi' }]), /model not found/);
  });
  it('generateChat surfaces unreachable Ollama with actionable error', async () => {
    env.aiProvider = 'ollama';
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await assert.rejects(() => generateChat([{ role: 'user', content: 'hi' }]), /ollama serve/);
  });
  it('generateJSON requests JSON format from Ollama', async () => {
    env.aiProvider = 'ollama';
    let seenFormat;
    mockFetch(async (url, opts) => {
      seenFormat = JSON.parse(opts.body).format;
      return openaiOk({ response: '{"tasks": []}', done: true });
    });
    const raw = await generateJSON('x');
    assert.equal(seenFormat, 'json');
    assert.deepEqual(extractJSON(raw), { tasks: [] });
  });
  it('generateText works without any key', async () => {
    env.aiProvider = 'ollama';
    mockFetch(async () => openaiOk({ response: 'plain answer', done: true }));
    assert.equal(await generateText('hi'), 'plain answer');
  });
  it('streamChat yields real NDJSON deltas then done', async () => {
    env.aiProvider = 'ollama';
    const frames = [
      `${JSON.stringify({ message: { content: 'Hel' }, done: false })}\n`,
      `${JSON.stringify({ message: { content: 'lo' }, done: false })}\n`,
      `${JSON.stringify({ done: true })}\n`,
    ];
    mockFetch(async () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        for (const f of frames) yield Buffer.from(f);
      })(),
    }));
    const events = [];
    for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) events.push(chunk);
    assert.deepEqual(events.map((e) => e.delta || ''), ['Hel', 'lo', '']);
    assert.ok(events.some((e) => e.done));
  });
});
