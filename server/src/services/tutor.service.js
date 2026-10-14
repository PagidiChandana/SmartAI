import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { AIUsage } from '../models/AIUsage.js';
import { Resource } from '../models/Resource.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { generateChat } from './ai.service.js';
import { retrieve, backfillMissingText, RETRIEVER_INFO } from './retrieval.service.js';

export const TUTOR_MODES = ['tutor', 'hint-first'];
const MAX_QUESTION = Number(process.env.TUTOR_MAX_QUESTION || 2000);
const HISTORY_TURNS = Number(process.env.TUTOR_HISTORY || 10);
const MAX_ANSWER = 4000;

async function ownConversation(user, id) {
  const conv = await Conversation.findOne({ _id: id, user: user._id });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  return conv;
}

function titleFrom(question) {
  const t = question.replace(/\s+/g, ' ').trim().slice(0, 60);
  return t || 'New chat';
}

function tutorSystem(mode) {
  const base =
    'You are StudyAI tutor for Indian school/college and competitive-exam students. ' +
    'Explain step-by-step in simple language. Use short steps, one worked example, ' +
    'key formulas in plain text, and end with one follow-up question. ' +
    'If the question is outside studies, say so briefly and redirect to studies. ' +
    'Never invent book titles, links, or source names — only cite the SOURCES section if given, else cite nothing.';
  if (mode === 'hint-first') {
    return base + ' HINT-FIRST MODE: do NOT give the full solution. Give 2-3 graded hints from gentle to specific, then ask the student to try the next step.';
  }
  return base;
}

function buildPrompt(question, history, hits) {
  const hist = history.map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n').slice(-3000);
  const src = hits.length
    ? 'SOURCES (approved study materials — cite by title only when you use them):\n' +
      hits.map((h, i) => `[${i + 1}] ${h.title} (${h.subject}): ${h.snippet}`).join('\n')
    : 'SOURCES: none retrieved. Answer from general knowledge and cite nothing.';
  return `${src}\n\n${hist ? `CONVERSATION SO FAR:\n${hist}\n\n` : ''}STUDENT QUESTION: ${question}`;
}

function validateAnswer(text) {
  const clean = (text || '').trim();
  if (!clean) throw new Error('Empty AI answer');
  return clean.slice(0, MAX_ANSWER);
}

// Honest fallback: answer extractively from actually-retrieved approved
// materials (quoted and labeled as such — never presented as generated),
// plus study guidance. Never fabricates citations; flags fallback:true.
function fallbackAnswer(question, hits, mode) {
  const lines = [
    '⚠️ The AI tutor is currently unavailable, so here is study guidance instead of a generated explanation.',
  ];
  if (env.aiProvider === 'ollama') {
    lines.push('(Ollama is configured but unreachable — make sure `ollama serve` is running and the model is pulled.)');
  }
  if (hits.length) {
    lines.push('', '📚 From your approved study materials (quoted, not generated):');
    hits.forEach((h, i) => {
      lines.push('', `${i + 1}. ${h.title}${h.subject ? ` (${h.subject})` : ''}`);
      if (h.snippet) lines.push(`   “${h.snippet.slice(0, 400)}”`);
    });
    lines.push('', mode === 'hint-first'
      ? 'Hint to start: restate what is given and what is asked in your own words, then try the first step.'
      : 'How to use this: read the quoted section, close the material, then explain it back without notes.');
  } else {
    if (mode === 'hint-first') {
      lines.push('', 'Try this approach:', '1. Write down what is given and what is asked.', '2. Recall one related formula or definition.', '3. Attempt the first step, then ask again with your attempt.');
    } else {
      lines.push('', 'How to tackle this:', '1. Break the question into smaller parts.', '2. Revise the underlying concept first.', '3. Work one example, then retry the question.');
    }
    lines.push('', 'No matching approved materials were found. Try the Library search or ask your educator to upload notes on this topic.');
  }
  return lines.join('\n').slice(0, MAX_ANSWER);
}

async function track(user, patch, startedAt) {
  try {
    await AIUsage.create({ user: user._id, feature: 'tutor-ask', provider: env.aiProvider, latencyMs: Date.now() - startedAt, ...patch });
  } catch {
    // usage ledger must never break answers
  }
}

// ---------- Conversations ----------
export async function listConversations(user) {
  return Conversation.find({ user: user._id }).sort({ updatedAt: -1 }).limit(50);
}

export async function createConversation(user, { title, mode } = {}) {
  if (mode && !TUTOR_MODES.includes(mode)) throw new ApiError(400, 'Invalid tutor mode');
  return Conversation.create({ user: user._id, title: (title || 'New chat').slice(0, 120), mode: mode || 'tutor' });
}

export async function getConversation(user, id) {
  const conv = await ownConversation(user, id);
  const messages = await ChatMessage.find({ conversation: conv._id }).sort({ createdAt: 1 }).limit(200);
  return { conversation: conv, messages };
}

export async function renameConversation(user, id, { title, mode }) {
  const conv = await ownConversation(user, id);
  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title cannot be empty');
    conv.title = title.trim().slice(0, 120);
  }
  if (mode !== undefined) {
    if (!TUTOR_MODES.includes(mode)) throw new ApiError(400, 'Invalid tutor mode');
    conv.mode = mode;
  }
  await conv.save();
  return conv;
}

export async function deleteConversation(user, id) {
  const conv = await Conversation.findOneAndDelete({ _id: id, user: user._id });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  await ChatMessage.deleteMany({ conversation: conv._id });
  return { id };
}

// ---------- Ask ----------
function sanitizeQuestion(q) {
  const text = (q || '').toString().trim().replace(/\0/g, '');
  if (!text) throw new ApiError(400, 'Question cannot be empty');
  if (text.length > MAX_QUESTION) throw new ApiError(400, `Question too long (max ${MAX_QUESTION} characters)`);
  return text;
}

export async function ask(user, conversationId, { question, mode }) {
  const startedAt = Date.now();
  const prep = await prepareAsk(user, conversationId, { question, mode });
  let answer;
  let fallback = false;
  try {
    answer = validateAnswer(await generateChat([{ role: 'user', content: prep.prompt }], { system: prep.system, timeoutMs: Number(process.env.TUTOR_TIMEOUT_MS || 60000) }));
  } catch (err) {
    fallback = true;
    answer = fallbackAnswer(prep.clean, prep.hits, prep.useMode);
    await track(user, { success: false, fallback: true, error: String(err.message || err).slice(0, 500) }, startedAt);
  }
  if (!fallback) await track(user, { success: true, fallback: false }, startedAt);
  const message = await finalizeAnswer(user, prep, answer, fallback);
  return { conversation: prep.conversation, userMessage: prep.userMessage, message, retriever: RETRIEVER_INFO.current, retrieverNote: RETRIEVER_INFO.description };
}

// Split for the SSE endpoint: prepare persists the user message and builds
// the prompt; finalize validates + persists the streamed answer.
export async function prepareAsk(user, conversationId, { question, mode }) {
  const clean = sanitizeQuestion(question);
  const conv = conversationId ? await ownConversation(user, conversationId) : await createConversation(user, { title: titleFrom(clean) });
  const useMode = TUTOR_MODES.includes(mode) ? mode : conv.mode;

  const userMessage = await ChatMessage.create({ user: user._id, conversation: conv._id, role: 'user', content: clean });
  const history = await ChatMessage.find({ conversation: conv._id }).sort({ createdAt: -1 }).limit(HISTORY_TURNS + 1).lean();
  history.reverse();

  await backfillMissingText({ limit: 3 });
  const { hits } = await retrieve(clean, { limit: 3 });
  return {
    conversation: conv,
    userMessage,
    clean,
    useMode,
    hits,
    system: tutorSystem(useMode),
    prompt: buildPrompt(clean, history, hits),
    startedAt: Date.now(),
  };
}

export async function finalizeAnswer(user, prep, answer, fallback) {
  const message = await ChatMessage.create({
    user: user._id,
    conversation: prep.conversation._id,
    role: 'assistant',
    content: validateAnswer(answer),
    sources: prep.hits.map((h) => ({ resource: h.resource, title: h.title, snippet: h.snippet.slice(0, 500) })),
    fallback,
  });
  prep.conversation.messageCount += 2;
  if (prep.conversation.title === 'New chat') prep.conversation.title = titleFrom(prep.clean);
  await prep.conversation.save();
  return message;
}

// Public for the SSE controller: same honest fallback, addressable from prep.
export function fallbackFor(prep) {
  return fallbackAnswer(prep.clean, prep.hits, prep.useMode);
}

// ---------- Feedback ----------
export async function vote(user, messageId, { vote }) {
  if (!['helpful', 'unhelpful'].includes(vote)) throw new ApiError(400, 'Vote must be helpful or unhelpful');
  const msg = await ChatMessage.findOne({ _id: messageId, user: user._id, role: 'assistant' });
  if (!msg) throw new ApiError(404, 'Answer not found');
  msg.vote = vote;
  await msg.save();
  return { vote: msg.vote };
}

export { MAX_QUESTION, RETRIEVER_INFO };
