import express from 'express';
import multer from 'multer';
import path from 'node:path';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import workerApi from '../../../cloudflare-worker/src/index.js';
import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';
import { hybridRedrawBuffer } from '../services/aiRedraw.service.js';
import { createLogoRestoreArtifacts } from '../services/logoRestore.service.js';

const router = express.Router();
const rasterMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const rasterExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const readyTraceMimeTypes = new Set(['image/svg+xml']);
const readyTraceExt = new Set(['.svg']);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);

function requestIdFromHeaders(headers = {}) {
  return headers['x-request-id'] || headers['x-railway-request-id'] || headers['cf-ray'] || '';
}

function summarizeError(error) {
  if (!error) return null;
  return {
    message: error.message || 'Unknown error',
    status: error.status || error.statusCode || 500,
    upstream: error.upstream || '',
    aiStage: error.aiStage || '',
    openRouterPath: error.openRouterPath || '',
    responseText: typeof error.responseText === 'string' ? error.responseText.slice(0, 500) : '',
    stack: typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 6).join('\n') : ''
  };
}

function logSaasError(tag, payload) {
  console.error(
    `[saas:${tag}] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload
    })}`
  );
}

function createUploadMiddleware({ mimeTypes, extensions, invalidMessage }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const mimeMatches = mimeTypes.has(file.mimetype) || !file.mimetype || file.mimetype === 'application/octet-stream';
      if (!mimeMatches || !extensions.has(ext)) {
        cb(new Error(invalidMessage));
        return;
      }
      cb(null, true);
    }
  });
}

const rasterUpload = createUploadMiddleware({
  mimeTypes: rasterMimeTypes,
  extensions: rasterExt,
  invalidMessage: 'File harus berupa JPG, PNG, atau WebP.'
});

const readyTraceUpload = createUploadMiddleware({
  mimeTypes: readyTraceMimeTypes,
  extensions: readyTraceExt,
  invalidMessage: 'Vector Siap Proses hanya menerima file vector SVG. EPS/AI belum aktif di server.'
});

function handleSingleUpload(upload, req, res, next) {
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

function handleRasterUpload(req, res, next) {
  handleSingleUpload(rasterUpload, req, res, next);
}

function handleReadyTraceUpload(req, res, next) {
  handleSingleUpload(readyTraceUpload, req, res, next);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function requireEnvValue(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Server belum dikonfigurasi: ${key} kosong.`);
  }
  return value;
}

function supabaseBaseUrl() {
  return requireEnvValue('SUPABASE_URL').replace(/\/+$/, '');
}

async function supabaseFetch(path, { method = 'GET', token, body, prefer } = {}) {
  const serviceRoleKey = requireEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl()}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token || serviceRoleKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase request failed: ${response.status}`);
  }
  return data;
}

async function getUser(req) {
  const token = bearerToken(req);
  if (!token) throw new Error('Login dibutuhkan.');
  const serviceRoleKey = requireEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error('Session tidak valid.');
  return { token, user };
}

async function getProfile(userId) {
  const rows = await supabaseFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at`,
    {}
  );
  const profile = rows?.[0];
  if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
  return profile;
}

async function requireUser(req) {
  const auth = await getUser(req);
  const profile = await getProfile(auth.user.id);
  return { ...auth, profile };
}

async function creditBalance(userId) {
  const rows = await supabaseFetch('/rest/v1/rpc/credit_balance', {
    method: 'POST',
    body: { target_user_id: userId }
  });
  return Number(rows || 0);
}

async function getPricing() {
  const defaults = { ready_trace: 2000, ai_redraw: 3000, separation_film: 0 };
  try {
    const rows = await supabaseFetch('/rest/v1/pricing_rules?select=key,amount_idr,active,description&order=key.asc', {});
    return rows.reduce(
      (pricing, row) => ({
        ...pricing,
        [row.key]: row.active === false ? pricing[row.key] : Number(row.amount_idr) || pricing[row.key]
      }),
      defaults
    );
  } catch (_error) {
    return defaults;
  }
}

async function assessVectorUploadQuality(buffer) {
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const shortestSide = Math.min(sourceWidth, sourceHeight);
  return {
    qualityStatus: 'pass',
    sourceWidth,
    sourceHeight,
    longestSide,
    shortestSide,
    minLongestSide: 0,
    idealLongestSide: 0,
    foregroundCoverage: 1,
    foregroundBoundsCoverage: 1,
    foregroundWidth: sourceWidth,
    foregroundHeight: sourceHeight,
    blurScore: null,
    contrast: null,
    noiseScore: null,
    backgroundColor: '#000000',
    reasons: [],
    warnings: [],
    recommendedMode: 'ready_trace',
    inputKind: 'vector',
    vectorFormat: 'svg'
  };
}

async function getAppSetting(key) {
  const rows = await supabaseFetch(`/rest/v1/app_settings?select=key,value,is_public,description,updated_at&key=eq.${encodeURIComponent(key)}&limit=1`, {});
  return rows?.[0] || null;
}

async function getAiRedrawModelConfig() {
  try {
    const setting = await getAppSetting('ai_redraw_model');
    return normalizeHybridRedrawConfig(setting?.value, process.env);
  } catch (_error) {
    return normalizeHybridRedrawConfig({}, process.env);
  }
}

function isSuperuserProfile(profile) {
  return ['superuser', 'superadmin'].includes(profile?.role);
}

function normalizeContactSubject(value) {
  const allowed = new Set(['umum', 'teknis', 'billing', 'lainnya']);
  return allowed.has(value) ? value : 'umum';
}

async function insertContactMessage(payload) {
  const rows = await supabaseFetch('/rest/v1/contact_messages?select=id,name,email,subject,message,status,created_at', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      name: payload.name,
      email: payload.email,
      subject: payload.subject,
      message: payload.message,
      status: 'pending'
    }
  });
  return rows?.[0] || null;
}

async function listContactMessages({ status } = {}) {
  const params = new URLSearchParams('select=id,name,email,subject,message,status,created_at,updated_at,replied_at');
  params.set('order', 'created_at.desc');
  params.set('limit', '1000');
  if (status && ['pending', 'read', 'replied'].includes(status)) {
    params.set('status', `eq.${status}`);
  }

  const rows = await supabaseFetch(`/rest/v1/contact_messages?${params.toString()}`, {});
  const counts = (rows || []).reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === 'pending') acc.pending += 1;
      if (row.status === 'read') acc.read += 1;
      if (row.status === 'replied') acc.replied += 1;
      return acc;
    },
    { pending: 0, read: 0, replied: 0, total: 0 }
  );

  return { messages: rows || [], counts };
}

async function updateContactMessage(messageId, patch) {
  const rows = await supabaseFetch(`/rest/v1/contact_messages?id=eq.${encodeURIComponent(messageId)}&select=id,name,email,subject,message,status,created_at,updated_at,replied_at`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch
  });
  return rows?.[0] || null;
}

async function ensureCredit(profile, priceIdr) {
  if (profile.is_unlimited) return { isUnlimited: true, balance: null };
  const balance = await creditBalance(profile.id);
  if (balance < priceIdr) throw new Error(`Saldo kurang. Dibutuhkan Rp${priceIdr}, saldo Rp${balance}.`);
  return { isUnlimited: false, balance };
}

async function insertLedger({ userId, amountIdr, kind, reason, referenceId, createdBy, metadata }) {
  const rows = await supabaseFetch('/rest/v1/credit_ledger?select=id', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: userId,
      amount_idr: amountIdr,
      kind,
      reason,
      reference_id: referenceId || null,
      created_by: createdBy || userId,
      metadata: metadata || {}
    }
  });
  return rows?.[0];
}

function encodeMetadataHeader(metadata) {
  return Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url');
}

function toAbsoluteUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${protocol}://${host}${req.originalUrl || req.url}`;
}

function buildWorkerRequest(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else {
      headers.set(key, String(value));
    }
  }
  headers.delete('host');

  const method = req.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body;
  if (hasBody && req.is('application/json')) {
    body = JSON.stringify(req.body || {});
    headers.set('content-type', 'application/json');
  } else if (hasBody) {
    body = req;
  }

  return new Request(toAbsoluteUrl(req), {
    method,
    headers,
    body,
    duplex: hasBody ? 'half' : undefined
  });
}

async function sendWorkerResponse(res, response) {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

async function workerHandler(req, res, next) {
  try {
    const response = await workerApi.fetch(buildWorkerRequest(req), process.env);
    await sendWorkerResponse(res, response);
  } catch (error) {
    next(error);
  }
}

function authenticatedWorkerHandler(req, res, next) {
  if (!bearerToken(req)) {
    next('route');
    return;
  }
  workerHandler(req, res, next);
}

async function imageRetouchHandler(req, res, next) {
  try {
    const { user, profile } = await requireUser(req);
    const pricing = await getPricing();
    await ensureCredit(profile, pricing.ai_redraw);
    if (!req.file?.buffer) throw new Error('File gambar wajib diisi.');

    const settings = JSON.parse(req.body?.settings || '{}');
    const requestId = requestIdFromHeaders(req.headers);
    let ledger = null;
    if (!profile.is_unlimited) {
      ledger = await insertLedger({
        userId: user.id,
        amountIdr: -pricing.ai_redraw,
        kind: 'debit',
        reason: 'ai_redraw',
        metadata: { inputMode: settings.inputMode, productionType: settings.productionType }
      });
    }

    try {
      const aiRedrawModel = settings.aiRedrawModel || (await getAiRedrawModelConfig());
      const result = await hybridRedrawBuffer(req.file.buffer, settings, aiRedrawModel);
      const encodedMetadata = encodeMetadataHeader(result.metadata);
      try {
        const artifactResult = await createTraceArtifactsFromImage({
          imageBuffer: result.imageBuffer,
          settings,
          metadata: result.metadata
        });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-AI-Ledger-Id', ledger?.id || '');
        res.setHeader('X-AI-Redraw-Metadata', encodedMetadata);
        res.json({
          ...artifactResult,
          aiRedrawMetadata: result.metadata,
          retouchLedgerId: ledger?.id || ''
        });
        return;
      } catch (artifactError) {
        if (result.metadata?.provider === 'logo_restore_trace_first') {
          throw artifactError;
        }
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-AI-Ledger-Id', ledger?.id || '');
      res.setHeader('X-AI-Redraw-Metadata', encodedMetadata);
      res.send(result.imageBuffer);
    } catch (error) {
      let refundError = null;
      if (ledger?.id) {
        try {
          await insertLedger({
            userId: user.id,
            amountIdr: pricing.ai_redraw,
            kind: 'credit',
            reason: 'ai_redraw_refund',
            referenceId: ledger.id,
            metadata: {
              inputMode: settings.inputMode,
              productionType: settings.productionType,
              refundedLedgerId: ledger.id
            }
          });
        } catch (insertError) {
          refundError = insertError;
          logSaasError('image_retouch_refund_failed', {
            requestId,
            userId: user.id,
            ledgerId: ledger.id,
            fileName: req.file?.originalname || '',
            fileSize: req.file?.size || 0,
            inputMode: settings.inputMode || '',
            productionType: settings.productionType || '',
            aiModel: settings.aiRedrawModel?.generationModel || '',
            error: summarizeError(insertError)
          });
        }
      }
      error.refundError = refundError ? summarizeError(refundError) : null;
      logSaasError('image_retouch_failed', {
        requestId,
        userId: user.id,
        isUnlimited: profile.is_unlimited === true,
        ledgerId: ledger?.id || '',
        fileName: req.file?.originalname || '',
        fileMimeType: req.file?.mimetype || '',
        fileSize: req.file?.size || 0,
        inputMode: settings.inputMode || '',
        productionType: settings.productionType || '',
        aiModel: settings.aiRedrawModel?.generationModel || '',
        error: summarizeError(error),
        refundError: error.refundError
      });
      error.loggedImageRetouchFailure = true;
      throw error;
    }
  } catch (error) {
    const status = error.status || error.statusCode || 500;
    if (!error.loggedImageRetouchFailure && (status >= 500 || error.upstream)) {
      logSaasError('image_retouch_request_failed', {
        requestId: requestIdFromHeaders(req.headers),
        fileName: req.file?.originalname || '',
        fileMimeType: req.file?.mimetype || '',
        fileSize: req.file?.size || 0,
        error: summarizeError(error)
      });
    }
    next(error);
  }
}

export { imageRetouchHandler };

async function readyTraceHandler(req, res, next) {
  try {
    await requireUser(req);
    if (!req.file?.buffer) throw new Error('File gambar wajib diisi.');

    const settings = {
      ...JSON.parse(req.body?.settings || '{}'),
      inputMode: 'ready_trace',
      makeVector: true,
      edgeRefinement: true,
      curveCleanup: true
    };
    let imageBuffer = req.file.buffer;
    let metadata = {
      provider: 'ready_trace_vector_upload',
      generationModel: 'none',
      generationQuality: 'deterministic',
      note: 'Vector Siap Proses menerima SVG vector murni untuk pisah warna dan contour sticker.'
    };
    const qualityAssessment = await assessVectorUploadQuality(req.file.buffer);
    metadata.qualityAssessment = qualityAssessment;
    metadata.vectorInput = {
      filename: req.file.originalname || 'upload.svg',
      mimeType: req.file.mimetype || 'image/svg+xml',
      directVectorUpload: true
    };

    const artifactResult = await createLogoRestoreArtifacts({
      imageBuffer,
      settings,
      metadata
    });
    res.setHeader('Content-Type', 'application/json');
    res.json({
      ...artifactResult,
      readyTraceMetadata: metadata
    });
  } catch (error) {
    next(error);
  }
}

async function submitContactHandler(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const subjectInput = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name) throw new Error('Nama wajib diisi.');
    if (!email) throw new Error('Email wajib diisi.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid.');
    if (!subjectInput) throw new Error('Subjek wajib dipilih.');
    const subject = normalizeContactSubject(subjectInput);
    if (message.length < 10) throw new Error('Pesan minimal 10 karakter.');
    if (message.length > 5000) throw new Error('Pesan maksimal 5000 karakter.');

    const contact = await insertContactMessage({ name, email, subject, message });
    res.status(201).json({
      success: true,
      message: 'Pesan Anda berhasil dikirim. Kami akan merespons dalam 1x24 jam.',
      contact
    });
  } catch (error) {
    next(error);
  }
}

async function requireSuperuser(req) {
  const { profile } = await requireUser(req);
  if (!isSuperuserProfile(profile)) throw new Error('Akses ditolak.');
  return profile;
}

async function contactMessagesHandler(req, res, next) {
  try {
    await requireSuperuser(req);
    const status = String(req.query?.status || '').trim();
    const data = await listContactMessages({ status });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function updateContactMessageHandler(req, res, next) {
  try {
    await requireSuperuser(req);
    const messageId = String(req.body?.messageId || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!messageId) throw new Error('MessageId diperlukan.');
    if (!['pending', 'read', 'replied'].includes(status)) throw new Error('Status tidak valid.');

    const patch = { status };
    if (status === 'replied') patch.replied_at = new Date().toISOString();
    const message = await updateContactMessage(messageId, patch);
    res.json({ message });
  } catch (error) {
    next(error);
  }
}

router.get('/api/app-config', workerHandler);
router.post('/api/manual-payments', workerHandler);
router.get('/api/me/balance', workerHandler);
router.post('/api/jobs/quote', workerHandler);
router.post('/api/jobs/commit', workerHandler);
router.get('/api/example-jobs', workerHandler);
router.post('/api/image-retouch', handleRasterUpload, imageRetouchHandler);
router.post('/api/ai-redraw', handleRasterUpload, imageRetouchHandler);
router.post('/api/ready-trace', handleReadyTraceUpload, readyTraceHandler);
router.post('/api/jobs/:jobId/artifacts', workerHandler);
router.delete('/api/jobs/:jobId', authenticatedWorkerHandler);
router.all('/api/admin/users', workerHandler);
router.post('/api/admin/credits', workerHandler);
router.get('/api/admin/overview', workerHandler);
router.get('/api/admin/jobs', workerHandler);
router.get('/api/admin/manual-payments', workerHandler);
router.all('/api/admin/pricing-rules', workerHandler);
router.all('/api/admin/settings', workerHandler);
router.post('/api/admin/jobs/:jobId/set-example', workerHandler);
router.post('/api/admin/jobs/:jobId/unset-example', workerHandler);
router.post('/api/admin/manual-payments/:paymentId/approve', workerHandler);
router.post('/api/admin/manual-payments/:paymentId/reject', workerHandler);
router.post('/api/contact', submitContactHandler);
router.get('/api/contact', contactMessagesHandler);
router.patch('/api/contact', updateContactMessageHandler);

export default router;
