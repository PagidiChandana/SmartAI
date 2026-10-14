import { Resource } from '../models/Resource.js';

/**
 * Retrieval interface for tutor RAG.
 *
 * Current implementation ("keyword"): token-overlap scoring over title,
 * subject, topic, description, and extracted file text of APPROVED resources.
 * This is lexical matching — it is NOT semantic/vector retrieval and is
 * never described as such to users.
 *
 * To add embeddings later: implement `vectorRetrieve()` (embed query with
 * the configured provider, kNN over a vector store at VECTOR_DB_URL) with
 * the same return shape, and select it in `retrieve()` when
 * `RETRIEVER=vector`. No route/service changes needed beyond this module.
 */

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'to', 'for',
  'and', 'or', 'how', 'what', 'why', 'with', 'me', 'my', 'explain', 'about',
  'please', 'help', 'does', 'do', 'can', 'ka', 'kya', 'hai', 'ke', 'ki',
]);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function snippetFor(text, terms) {
  const low = (text || '').toLowerCase();
  for (const t of terms) {
    const i = low.indexOf(t);
    if (i !== -1) {
      const start = Math.max(0, i - 90);
      const end = Math.min(text.length, i + 210);
      return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    }
  }
  return (text || '').slice(0, 220).trim();
}

function scoreDoc(doc, terms) {
  if (terms.length === 0) return { score: 0, snippet: '' };
  const fields = [
    { text: `${doc.title} ${doc.topic}`, weight: 5 },
    { text: doc.subject, weight: 3 },
    { text: doc.description, weight: 2 },
    { text: doc.extractedText, weight: 1 },
  ];
  let score = 0;
  for (const { text, weight } of fields) {
    const low = (text || '').toLowerCase();
    for (const t of terms) {
      if (low.includes(t)) score += weight;
    }
  }
  const haystack = `${doc.title}\n${doc.topic}\n${doc.description}\n${doc.extractedText || ''}`;
  return { score, snippet: snippetFor(haystack, terms) };
}

export async function keywordRetrieve(query, { limit = 3 } = {}) {  const terms = [...new Set(tokenize(query))].slice(0, 12);
  if (terms.length === 0) return { retriever: 'keyword', hits: [] };
  const pool = await Resource.find({ status: 'approved' })
    .select('+extractedText title subject topic description format difficulty')
    .sort({ bookmarkCount: -1 })
    .limit(120)
    .lean();
  return {
    retriever: 'keyword',
    hits: pool
      .map((doc) => ({ doc, ...scoreDoc(doc, terms) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((h) => ({
        resource: h.doc._id,
        title: h.doc.title,
        subject: h.doc.subject,
        snippet: h.snippet,
        score: h.score,
      })),
  };
}

export async function retrieve(query, opts) {
  const mode = (process.env.RETRIEVER || 'keyword').toLowerCase();
  if (mode === 'vector') {
    // No vector store is configured in this project — fall back honestly.
    // Implement vectorRetrieve() here when VECTOR_DB_URL + embeddings exist.
    const base = await keywordRetrieve(query, opts);
    return { ...base, retriever: 'keyword (vector requested, not configured)' };
  }
  return keywordRetrieve(query, opts);
}

export const RETRIEVER_INFO = {
  current: (process.env.RETRIEVER || 'keyword').toLowerCase(),
  semantic: false,
  description: 'Keyword token-overlap retrieval over approved materials. Not semantic vector search.',
};

/**
 * Lazy backfill: older file resources uploaded before text indexing get
 * their extractedText populated (cap 3 per call to bound latency).
 */
export async function backfillMissingText({ limit = 3 } = {}) {
  const { resourceFilePath } = await import('./storage.service.js');
  const { extractStoredFileText } = await import('./syllabus.service.js');
  const docs = await Resource.find({
    status: 'approved',
    filePath: { $ne: null },
    $or: [{ extractedText: '' }, { extractedText: { $exists: false } }],
  })
    .select('+extractedText filePath fileName')
    .limit(limit);
  for (const d of docs) {
    try {
      const text = await extractStoredFileText(resourceFilePath(d.filePath), d.fileName || '');
      if (text) {
        d.extractedText = text;
        await d.save();
      }
    } catch {
      // best-effort only
    }
  }
}
