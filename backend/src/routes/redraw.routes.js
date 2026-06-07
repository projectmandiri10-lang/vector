import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { hybridRedrawBuffer } from '../services/aiRedraw.service.js';
import { validateSettings } from './jobs.routes.js';

const router = express.Router();

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);
const uploadRateLimitPerMinute = Math.min(30, Math.max(1, Number.parseInt(process.env.UPLOAD_RATE_LIMIT_PER_MINUTE || '4', 10)));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExt.has(ext)) {
      cb(new Error('File harus berupa JPG, PNG, atau WebP.'));
      return;
    }
    cb(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `Ukuran file maksimal ${maxUploadMb} MB.` });
      return;
    }

    res.status(400).json({ error: error.message || 'Upload gambar tidak valid.' });
  });
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: uploadRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak upload. Coba lagi sebentar.' }
});

function encodeMetadataHeader(metadata) {
  return Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url');
}

router.post('/hybrid', uploadLimiter, handleUpload, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: 'File gambar wajib diisi.' });
      return;
    }

    const rawSettings = typeof req.body?.settings === 'string' ? JSON.parse(req.body.settings || '{}') : req.body?.settings || {};
    const settings = validateSettings(rawSettings);
    const result = await hybridRedrawBuffer(req.file.buffer, settings, rawSettings.aiRedrawModel || {});

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-AI-Redraw-Metadata', encodeMetadataHeader(result.metadata));
    res.send(result.imageBuffer);
  } catch (error) {
    next(error);
  }
});

export default router;
