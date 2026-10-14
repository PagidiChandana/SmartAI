import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { ApiError } from '../utils/ApiError.js';

const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md']);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return cb(new ApiError(400, `File type ${ext} not allowed. Allowed: pdf, png, jpg, txt, md`));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Syllabus uploads: PDF / TXT / MD only, up to 10 MB. Service validates content.
const SYLLABUS_ALLOWED = new Set(['.pdf', '.txt', '.md']);

function syllabusFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SYLLABUS_ALLOWED.has(ext)) {
    return cb(new ApiError(400, `File type ${ext} not allowed. Allowed: pdf, txt, md`));
  }
  cb(null, true);
}

export const syllabusUpload = multer({
  storage,
  fileFilter: syllabusFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Educator materials: notes/PDFs/articles (and scanned-note images), 10 MB.
const RESOURCE_ALLOWED = new Set(['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg']);

function resourceFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!RESOURCE_ALLOWED.has(ext)) {
    return cb(new ApiError(400, `File type ${ext} not allowed. Allowed: pdf, txt, md, png, jpg`));
  }
  cb(null, true);
}

const resourceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve('uploads', 'resources');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

export const resourceUpload = multer({
  storage: resourceStorage,
  fileFilter: resourceFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
