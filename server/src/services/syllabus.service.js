import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ApiError } from '../utils/ApiError.js';

const require = createRequire(import.meta.url);

export const SYLLABUS_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const SYLLABUS_ALLOWED_EXT = new Set(['.pdf', '.txt', '.md']);
const ALLOWED_MIME = new Set(['application/pdf', 'text/plain', 'text/markdown']);

/** Validate file type/size, extract raw text (PDF via pdf-parse, txt/md via utf-8 read). */
export async function extractSyllabusText(file) {
  if (!file) throw new ApiError(400, 'No file uploaded. Attach a PDF or text file.');
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!SYLLABUS_ALLOWED_EXT.has(ext)) {
    throw new ApiError(400, `Unsupported file type "${ext}". Allowed: PDF, TXT, MD.`);
  }
  if (file.size > SYLLABUS_MAX_BYTES) {
    throw new ApiError(400, 'File too large. Maximum size is 10 MB.');
  }

  let text = '';
  if (ext === '.pdf') {
    if (file.mimetype && !['application/pdf', 'application/octet-stream'].includes(file.mimetype)) {
      throw new ApiError(400, `Unexpected MIME type "${file.mimetype}" for a PDF.`);
    }
    const buf = fs.readFileSync(file.path);
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buf);
      text = (data.text || '').trim();
    } catch {
      throw new ApiError(422, 'Could not parse this PDF. Try a text-based PDF, TXT or MD file.');
    }
  } else {
    if (file.mimetype && ![...ALLOWED_MIME, 'application/octet-stream'].includes(file.mimetype)) {
      throw new ApiError(400, `Unexpected MIME type "${file.mimetype}" for a text file.`);
    }
    text = fs.readFileSync(file.path, 'utf-8').trim();
    if (/[\u0000]/.test(text.slice(0, 1000))) {
      throw new ApiError(422, 'File does not look like readable text. Upload a text-based file.');
    }
  }

  // Remove temp file — we persist extracted topics, not the raw upload.
  fs.rm(file.path, { force: true }, () => {});
  if (text.length < 20) {
    throw new ApiError(422, 'No readable syllabus content found. Upload a file with real text content.');
  }
  return text.slice(0, 60000);
}

const HEADING_RE = /^(unit|chapter|module|section|part|lesson|week)\b[\s:\-–.0-9]*/i;

/**
 * Non-destructive text extraction for already-stored files (tutor RAG index).
 * Returns '' for non-text formats (images) instead of throwing. Never deletes.
 */
export async function extractStoredFileText(absPath, originalName, maxChars = 20000) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!['.pdf', '.txt', '.md'].includes(ext)) return '';
  try {
    let text = '';
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(absPath));
      text = (data.text || '').trim();
    } else {
      text = fs.readFileSync(absPath, 'utf-8').trim();
      if (/[\u0000]/.test(text.slice(0, 1000))) return '';
    }
    return text.length < 20 ? '' : text.slice(0, maxChars);
  } catch {
    return '';
  }
}const NUM_PREFIX_RE = /^(\d{1,2}(\.\d{1,2}){0,3}[\).\:\-–\s]+)(.+)$/;

/** Heuristic: headings/numbered lines become topics; fallback = sentence chunks. Max 100. */
export function topicsFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s{2,}/g, ' '))
    .filter((l) => l.length >= 3 && l.length <= 160 && /[a-zA-Z]/.test(l));

  const picked = [];
  const seen = new Set();
  const push = (title, section = '') => {
    const key = title.toLowerCase();
    if (seen.has(key) || picked.length >= 100) return;
    seen.add(key);
    picked.push({ title: title.slice(0, 200), section: section.slice(0, 200) });
  };

  let currentSection = '';
  for (const line of lines) {
    if (HEADING_RE.test(line)) {
      currentSection = line;
      push(line, '');
      continue;
    }
    const num = line.match(NUM_PREFIX_RE);
    if (num && num[3].length >= 3) {
      push(num[3].trim(), currentSection);
      continue;
    }
    if (/^[A-Z][\w\s,&'()\-/]{4,}$/.test(line) && line.length <= 90) push(line, currentSection);
  }

  if (picked.length === 0) {
    // Fallback: split into sentence-ish chunks so every valid file yields something.
    const chunks = text.replace(/\s+/g, ' ').match(/[^.!?]{12,140}[.!?]?/g) || [];
    for (const c of chunks.slice(0, 30)) push(c.trim());
  }
  return picked;
}
