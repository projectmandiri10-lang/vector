import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs-extra';
import multer from 'multer';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { buildRedrawPrompt, redrawWithAI } from '../services/aiRedraw.service.js';
import { exportSvgToPdf, exportSvgToPng } from '../services/export.service.js';
import { preprocessUploadedImage } from '../services/preprocess.service.js';
import { createMasksForPalette, quantizeImage } from '../services/quantize.service.js';
import { createSeparations } from '../services/separation.service.js';
import { createStickerCutline } from '../services/stickerCutline.service.js';
import { vectorizeMasks } from '../services/vectorize.service.js';
import { createResultZip, createSeparationZip } from '../services/zip.service.js';
import { normalizeActualWidthCm } from '../utils/paper.js';
import {
  assertValidJobId,
  ensureJobDir,
  fileExists,
  getJobDir,
  readJobMeta,
  safeJobPath,
  writeJobMeta
} from '../utils/file.js';

const router = express.Router();
const jobs = new Map();

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);

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
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak upload. Coba lagi sebentar.' }
});

const statusMessages = {
  uploaded: 'Gambar diterima.',
  preprocessing: 'Sedang menyiapkan gambar.',
  processing_ai: 'Sedang menggambar ulang.',
  vectorizing: 'Sedang membuat vector.',
  separating_colors: 'Sedang pecah warna.',
  exporting: 'Sedang menyiapkan file download.',
  done: 'Selesai.',
  failed: 'Gagal memproses gambar.'
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeOffsetMm(value, fallback = 2) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(20, Math.max(0.1, parsed));
}

export function validateSettings(body = {}) {
  const productionType = body.productionType === 'sablon' ? 'sablon' : 'sticker';
  const defaultSeparate = productionType === 'sablon';
  const maxColors = Math.min(6, Math.max(2, Number.parseInt(body.maxColors || '4', 10)));
  const explicitColorLimitMode = body.colorLimitMode === 'manual' || body.colorLimitMode === 'auto';
  const colorLimitMode = explicitColorLimitMode ? body.colorLimitMode : body.maxColors ? 'manual' : 'auto';
  const separateColors = parseBoolean(body.separateColors, defaultSeparate);
  const paperSize = String(body.paperSize || 'A4').toUpperCase() === 'A3' ? 'A3' : 'A4';
  const paperOrientation = String(body.paperOrientation || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  const inputMode = body.inputMode === 'ready_trace' ? 'ready_trace' : 'ai_redraw';

  return {
    projectName: String(body.projectName || 'Project Vector').trim().slice(0, 80) || 'Project Vector',
    productionType,
    inputMode,
    makeVector: parseBoolean(body.makeVector, true) || separateColors,
    separateColors,
    colorLimitMode,
    maxColors,
    whiteAsBackground: parseBoolean(body.whiteAsBackground, true),
    aiQuality: 'standard',
    actualWidthCm: normalizeActualWidthCm(body.actualWidthCm, 10),
    includeBackgroundInFilmSize: parseBoolean(body.includeBackgroundInFilmSize, false),
    stickerCutlineEnabled: productionType === 'sticker' && parseBoolean(body.stickerCutlineEnabled, true),
    stickerCutlineOffsetMm: normalizeOffsetMm(body.stickerCutlineOffsetMm, 2),
    createUnderbaseFilm: productionType === 'sablon' && parseBoolean(body.createUnderbaseFilm, true),
    paperSize,
    paperOrientation,
    priceIdr: 20000,
    paymentStatus: 'skipped_mvp'
  };
}

async function updateJob(jobId, patch) {
  const current = jobs.get(jobId) || (await readJobMeta(jobId));
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  jobs.set(jobId, next);
  await writeJobMeta(jobId, next);
  return next;
}

function publicFiles(jobId, meta) {
  const files = {};
  const maybe = (key, relativePath, downloadPath) => {
    const absolutePath = safeJobPath(jobId, ...relativePath.split('/'));
    if (fs.existsSync(absolutePath)) files[key] = downloadPath;
  };

  maybe('fullPng', 'preview-full-color.png', `/api/jobs/${jobId}/download/full-png`);
  maybe('fullSvg', 'full-vector.svg', `/api/jobs/${jobId}/download/full-svg`);
  maybe('fullPdf', 'full-vector.pdf', `/api/jobs/${jobId}/download/full-pdf`);
  maybe('stickerCutlineSvg', 'sticker-cutline.svg', `/api/jobs/${jobId}/download/sticker-cutline-svg`);
  maybe('stickerCutlinePdf', 'sticker-cutline.pdf', `/api/jobs/${jobId}/download/sticker-cutline-pdf`);
  maybe('zip', 'result.zip', `/api/jobs/${jobId}/download/zip`);
  maybe('separationZip', 'separation-films.zip', `/api/jobs/${jobId}/download/separation-zip`);

  if (Array.isArray(meta?.separations)) {
    files.separations = meta.separations.map((film) => ({
      index: film.index,
      kind: film.kind || 'color',
      hex: film.hex,
      label: film.label,
      svg:
        film.kind === 'underbase'
          ? `/api/jobs/${jobId}/download/underbase-svg`
          : `/api/jobs/${jobId}/download/separation-svg/${film.index}`,
      pdf:
        film.kind === 'underbase'
          ? `/api/jobs/${jobId}/download/underbase-pdf`
          : `/api/jobs/${jobId}/download/separation-pdf/${film.index}`,
      preview:
        film.kind === 'underbase'
          ? `/api/jobs/${jobId}/download/underbase-preview`
          : `/api/jobs/${jobId}/download/separation-preview/${film.index}`
    }));
  }

  return files;
}

function publicJobSummary(jobId, meta) {
  return {
    jobId,
    status: meta.status,
    progress: meta.progress,
    message: meta.message,
    settings: meta.settings,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    error: meta.error,
    files: publicFiles(jobId, meta)
  };
}

async function listJobSummaries() {
  const jobsRoot = path.dirname(getJobDir('00000000-0000-4000-8000-000000000000'));
  if (!(await fileExists(jobsRoot))) return [];

  const entries = await fs.readdir(jobsRoot);
  const summaries = [];
  for (const entry of entries) {
    if (!/^[0-9a-f-]{36}$/i.test(entry)) continue;
    const meta = jobs.get(entry) || (await readJobMeta(entry));
    if (!meta) continue;
    summaries.push(publicJobSummary(entry, meta));
  }

  return summaries.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

async function processJob(jobId, uploadedBuffer) {
  const meta = jobs.get(jobId);
  const jobDir = getJobDir(jobId);

  try {
    await updateJob(jobId, {
      status: 'preprocessing',
      progress: 12,
      message: statusMessages.preprocessing
    });
    const input = await preprocessUploadedImage(uploadedBuffer, jobDir);

    let sourceImagePath = input.cleanInputPath;
    let prompt = null;
    if (meta.settings.inputMode === 'ready_trace') {
      sourceImagePath = safeJobPath(jobId, 'trace-source.png');
      await fs.copy(input.cleanInputPath, sourceImagePath);
      await fs.copy(sourceImagePath, safeJobPath(jobId, 'preview-full-color.png'));
    } else {
      await updateJob(jobId, {
        status: 'processing_ai',
        progress: 30,
        message: statusMessages.processing_ai
      });
      const aiOutputPath = safeJobPath(jobId, 'ai-redraw.png');
      prompt = buildRedrawPrompt(meta.settings);
      await redrawWithAI(input.cleanInputPath, aiOutputPath, meta.settings);
      sourceImagePath = aiOutputPath;
      await fs.copy(aiOutputPath, safeJobPath(jobId, 'preview-full-color.png'));
    }

    let palette = [];
    let pathsByColor = [];
    let separations = [];
    let stickerCutline = null;
    let vectorWidth = input.width;
    let vectorHeight = input.height;

    if (meta.settings.makeVector) {
      await updateJob(jobId, {
        status: 'vectorizing',
        progress: 55,
        message: statusMessages.vectorizing,
        prompt
      });

      const quantized = await quantizeImage(sourceImagePath, {
        colorLimitMode: meta.settings.colorLimitMode,
        maxColors: meta.settings.maxColors,
        whiteAsBackground: meta.settings.whiteAsBackground,
        productionType: meta.settings.productionType,
        separateColors: meta.settings.separateColors
      });
      vectorWidth = quantized.width;
      vectorHeight = quantized.height;
      palette = quantized.palette;
      await fs.writeJson(safeJobPath(jobId, 'palette.json'), palette, { spaces: 2 });

      const masks = await createMasksForPalette(sourceImagePath, palette, safeJobPath(jobId, 'masks'), {
        whiteAsBackground: meta.settings.whiteAsBackground,
        productionType: meta.settings.productionType,
        separateColors: meta.settings.separateColors,
        includeBackgroundInFilmSize: meta.settings.includeBackgroundInFilmSize
      });

      const vectorResult = await vectorizeMasks(masks, {
        width: quantized.width,
        height: quantized.height,
        outputPath: safeJobPath(jobId, 'full-vector.svg')
      });
      pathsByColor = vectorResult.pathsByColor;

      stickerCutline = await createStickerCutline({
        masks,
        pathsByColor,
        width: quantized.width,
        height: quantized.height,
        outputDir: jobDir,
        settings: meta.settings
      });
    }

    if (meta.settings.separateColors && pathsByColor.length > 0) {
      await updateJob(jobId, {
        status: 'separating_colors',
        progress: 73,
        message: statusMessages.separating_colors,
        palette
      });
      separations = await createSeparations({
        pathsByColor,
        width: vectorWidth,
        height: vectorHeight,
        outputDir: safeJobPath(jobId, 'separations'),
        settings: meta.settings
      });
    }

    await updateJob(jobId, {
      status: 'exporting',
      progress: 88,
      message: statusMessages.exporting,
      palette,
      separations,
      stickerCutline
    });

    if (await fileExists(safeJobPath(jobId, 'full-vector.svg'))) {
      await exportSvgToPdf(safeJobPath(jobId, 'full-vector.svg'), safeJobPath(jobId, 'full-vector.pdf'));
    }

    if (stickerCutline) {
      await exportSvgToPdf(stickerCutline.svgPath, stickerCutline.pdfPath);
    }

    for (const film of separations) {
      await exportSvgToPdf(film.svgPath, film.pdfPath);
      await exportSvgToPng(film.svgPath, film.previewPath);
    }

    await createResultZip(jobDir, safeJobPath(jobId, 'result.zip'));
    if (separations.length > 0) {
      await createSeparationZip(safeJobPath(jobId, 'separations'), safeJobPath(jobId, 'separation-films.zip'));
    }

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      message: statusMessages.done,
      files: publicFiles(jobId, { separations }),
      palette,
      separations,
      stickerCutline
    });
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      progress: 100,
      message: statusMessages.failed,
      error: error.message
    });
  }
}

router.post('/', uploadLimiter, handleUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Upload gambar wajib diisi.' });
      return;
    }

    const jobId = uuidv4();
    await ensureJobDir(jobId);
    const settings = validateSettings(req.body);
    const job = {
      jobId,
      status: 'uploaded',
      progress: 5,
      message: statusMessages.uploaded,
      settings,
      priceIdr: 20000,
      paymentStatus: 'skipped_mvp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {}
    };

    jobs.set(jobId, job);
    await writeJobMeta(jobId, job);
    processJob(jobId, req.file.buffer);

    res.status(202).json({ jobId, status: job.status, message: job.message });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    res.json({ jobs: await listJobSummaries() });
  } catch (error) {
    next(error);
  }
});

router.get('/:jobId', async (req, res, next) => {
  try {
    assertValidJobId(req.params.jobId);
    const meta = jobs.get(req.params.jobId) || (await readJobMeta(req.params.jobId));
    if (!meta) {
      res.status(404).json({ error: 'Job tidak ditemukan.' });
      return;
    }

    res.json({
      ...meta,
      files: publicFiles(req.params.jobId, meta)
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:jobId', async (req, res, next) => {
  try {
    assertValidJobId(req.params.jobId);
    const meta = jobs.get(req.params.jobId) || (await readJobMeta(req.params.jobId));
    if (!meta) {
      res.status(404).json({ error: 'Job tidak ditemukan.' });
      return;
    }

    if (!['done', 'failed'].includes(meta.status)) {
      res.status(409).json({ error: 'Job masih diproses. Tunggu selesai atau gagal sebelum menghapus hasil.' });
      return;
    }

    jobs.delete(req.params.jobId);
    await fs.remove(getJobDir(req.params.jobId));
    res.json({ ok: true, deletedJobId: req.params.jobId });
  } catch (error) {
    next(error);
  }
});

function sendJobFile(relativePath, downloadName) {
  return async (req, res, next) => {
    try {
      assertValidJobId(req.params.jobId);
      const filePath = safeJobPath(req.params.jobId, ...relativePath(req).split('/'));
      if (!(await fileExists(filePath))) {
        res.status(404).json({ error: 'File belum tersedia.' });
        return;
      }
      res.download(filePath, downloadName(req), (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  };
}

function sendInlineJobFile(relativePath, contentType) {
  return async (req, res, next) => {
    try {
      assertValidJobId(req.params.jobId);
      const filePath = safeJobPath(req.params.jobId, ...relativePath(req).split('/'));
      if (!(await fileExists(filePath))) {
        res.status(404).json({ error: 'File belum tersedia.' });
        return;
      }
      res.type(contentType);
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  };
}

function filmIndex(req) {
  const index = Number.parseInt(req.params.index, 10);
  if (!Number.isInteger(index) || index < 1 || index > 99) {
    const error = new Error('Nomor film tidak valid.');
    error.status = 400;
    throw error;
  }
  return String(index).padStart(2, '0');
}

router.get('/:jobId/download/full-png', sendJobFile(() => 'preview-full-color.png', () => 'preview-full-color.png'));
router.get('/:jobId/download/full-svg', sendJobFile(() => 'full-vector.svg', () => 'full-vector.svg'));
router.get('/:jobId/download/full-pdf', sendJobFile(() => 'full-vector.pdf', () => 'full-vector.pdf'));
router.get('/:jobId/download/sticker-cutline-svg', sendJobFile(() => 'sticker-cutline.svg', () => 'sticker-cutline.svg'));
router.get('/:jobId/download/sticker-cutline-pdf', sendJobFile(() => 'sticker-cutline.pdf', () => 'sticker-cutline.pdf'));
router.get('/:jobId/download/zip', sendJobFile(() => 'result.zip', () => 'result.zip'));
router.get(
  '/:jobId/download/separation-zip',
  sendJobFile(() => 'separation-films.zip', () => 'film-sablon.zip')
);
router.get(
  '/:jobId/download/separation-svg/:index',
  sendInlineJobFile((req) => `separations/film-color-${filmIndex(req)}.svg`, 'svg')
);
router.get(
  '/:jobId/download/separation-pdf/:index',
  sendJobFile((req) => `separations/film-color-${filmIndex(req)}.pdf`, (req) => `film-color-${filmIndex(req)}.pdf`)
);
router.get(
  '/:jobId/download/separation-preview/:index',
  sendInlineJobFile((req) => `separations/film-color-${filmIndex(req)}-preview.png`, 'png')
);
router.get('/:jobId/download/underbase-svg', sendInlineJobFile(() => 'separations/film-underbase.svg', 'svg'));
router.get('/:jobId/download/underbase-pdf', sendJobFile(() => 'separations/film-underbase.pdf', () => 'film-underbase.pdf'));
router.get('/:jobId/download/underbase-preview', sendInlineJobFile(() => 'separations/film-underbase-preview.png', 'png'));

export default router;
