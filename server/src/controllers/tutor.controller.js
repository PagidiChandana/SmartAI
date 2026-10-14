import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { streamChat } from '../services/ai.service.js';
import { AIUsage } from '../models/AIUsage.js';
import { env } from '../config/env.js';
import * as tutor from '../services/tutor.service.js';

export const listConversations = asyncHandler(async (req, res) => {
  new ApiResponse('Conversations fetched', await tutor.listConversations(req.user)).send(res);
});

export const createConversation = asyncHandler(async (req, res) => {
  new ApiResponse('Chat started', await tutor.createConversation(req.user, req.body), 201).send(res);
});

export const getConversation = asyncHandler(async (req, res) => {
  new ApiResponse('Conversation fetched', await tutor.getConversation(req.user, req.params.id)).send(res);
});

export const renameConversation = asyncHandler(async (req, res) => {
  new ApiResponse('Conversation updated', await tutor.renameConversation(req.user, req.params.id, req.body)).send(res);
});

export const deleteConversation = asyncHandler(async (req, res) => {
  new ApiResponse('Conversation deleted', await tutor.deleteConversation(req.user, req.params.id)).send(res);
});

export const ask = asyncHandler(async (req, res) => {
  const result = await tutor.ask(req.user, req.params.id || null, req.body);
  new ApiResponse(
    result.message.fallback ? 'AI unavailable — study guidance with retrieved sources' : 'Answer ready',
    result
  ).send(res);
});

export const vote = asyncHandler(async (req, res) => {
  new ApiResponse('Feedback saved', await tutor.vote(req.user, req.params.messageId, req.body)).send(res);
});

// POST /conversations/:id?/messages/stream — Server-Sent Events.
// Streams real provider tokens when supported (OpenAI); otherwise streams
// the final text in chunks. The answer is validated + persisted before
// `done`, so refresh never loses it. Falls back to study guidance if the
// AI service fails mid-stream.
export const askStream = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const prep = await tutor.prepareAsk(req.user, req.params.id || null, req.body);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'meta', sources: prep.hits.map((h) => ({ title: h.title, snippet: h.snippet })) });

  let full = '';
  let failed = null;
  try {
    for await (const chunk of streamChat([{ role: 'user', content: prep.prompt }], { system: prep.system })) {
      if (chunk.delta) {
        full += chunk.delta;
        send({ type: 'delta', text: chunk.delta.slice(0, 2000) });
      }
      if (chunk.done) break;
    }
  } catch (err) {
    failed = err;
  }

  let message;
  if (failed || !full.trim()) {
    message = await tutor.finalizeAnswer(req.user, prep, tutor.fallbackFor(prep, failed), true);
    send({ type: 'fallback', text: message.content });
    try {
      await AIUsage.create({ user: req.user._id, feature: 'tutor-ask', provider: env.aiProvider, success: false, fallback: true, latencyMs: Date.now() - startedAt, error: String(failed?.message || 'stream failed').slice(0, 500) });
    } catch { /* ledger never breaks answers */ }
  } else {
    message = await tutor.finalizeAnswer(req.user, prep, full, false);
    try {
      await AIUsage.create({ user: req.user._id, feature: 'tutor-ask', provider: env.aiProvider, success: true, fallback: false, latencyMs: Date.now() - startedAt });
    } catch { /* ledger never breaks answers */ }
  }
  if (!message) throw new ApiError(500, 'Could not save answer');
  send({ type: 'done', messageId: message._id, conversationId: prep.conversation._id, fallback: message.fallback });
  res.end();
});
