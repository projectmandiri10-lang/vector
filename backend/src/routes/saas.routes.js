import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { Readable } from 'node:stream';
import workerApi from '../../../cloudflare-worker/src/index.js';
import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';
import { hybridRedrawBuffer } from '../services/aiRedraw.service.js';

const router = express.Router();
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
  const defaults = { ready_trace: 1000, ai_redraw: 5000, separation_film: 1000 };
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
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-AI-Ledger-Id', ledger?.id || '');
      res.setHeader('X-AI-Redraw-Metadata', encodeMetadataHeader(result.metadata));
      res.send(result.imageBuffer);
    } catch (error) {
      if (ledger?.id) {
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
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export { imageRetouchHandler };

router.get('/api/app-config', workerHandler);
router.post('/api/manual-payments', workerHandler);
router.get('/api/me/balance', workerHandler);
router.post('/api/jobs/quote', workerHandler);
router.post('/api/jobs/commit', workerHandler);
router.get('/api/example-jobs', workerHandler);
router.post('/api/image-retouch', handleUpload, imageRetouchHandler);
router.post('/api/ai-redraw', handleUpload, imageRetouchHandler);
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

export default router;
