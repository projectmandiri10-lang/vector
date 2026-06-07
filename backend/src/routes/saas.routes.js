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
  const defaults = { ready_trace: 1000, ai_redraw: 2500, separation_film: 1000 };
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
router.post('/api/contact', submitContactHandler);
router.get('/api/contact', contactMessagesHandler);
router.patch('/api/contact', updateContactMessageHandler);

export default router;
