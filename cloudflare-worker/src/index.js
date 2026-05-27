import { AI_REDRAW_PRICE_IDR, SUPERUSER_EMAIL } from './pricing.js';
import {
  decorateAdminJobs,
  EXAMPLE_JOBS_BUCKET,
  exampleActivePath,
  exampleSourcePath,
  getExampleSourcePathFromManifest,
  isSuperuserProfile,
  normalizeExampleJobsSetting,
  updateExampleJobsSetting
} from './example-jobs.js';

const DEFAULT_PRICING = {
  ready_trace: 1000,
  ai_redraw: AI_REDRAW_PRICE_IDR,
  separation_film: 1000
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type'
};

function requireEnvValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Worker belum dikonfigurasi: ${key} kosong.`);
  }
  return value;
}

function supabaseBaseUrl(env) {
  return requireEnvValue(env, 'SUPABASE_URL').replace(/\/+$/, '');
}

function hasEnvValue(env, key) {
  return Boolean(env[key]);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...headers }
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function litellmImagesUrl(env) {
  const baseUrl = requireEnvValue(env, 'LITELLM_BASE_URL').replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${baseUrl}/v1/images/edits`;
}

function storageBaseUrl(env) {
  return `${supabaseBaseUrl(env)}/storage/v1`;
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function formatDate(date) {
  return date.toISOString();
}

function calculateDynamicJobPrice({ inputMode = 'ready_trace', separationFilmCount = 0, aiAlreadyCharged = false } = {}, pricing = DEFAULT_PRICING) {
  const basePrice =
    inputMode === 'ai_redraw'
      ? aiAlreadyCharged
        ? 0
        : pricing.ai_redraw
      : pricing.ready_trace;
  return basePrice + Math.max(0, Number(separationFilmCount) || 0) * pricing.separation_film;
}

function imageModelCandidates(env) {
  const configured = env.LITELLM_IMAGE_MODEL || env.AI_IMAGE_MODEL || 'gpt-image-2';
  const candidates = [configured];

  if (configured === 'gpt-image-2') candidates.push('openai/gpt-image-2');
  if (configured === 'openai/gpt-image-2') candidates.push('gpt-image-2');

  return [...new Set(candidates)];
}

function dataUrlToUint8Array(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Preview contoh gambar tidak valid.');
  const [, mimeType, base64] = match;
  if (mimeType !== 'image/png') throw new Error('Preview contoh harus berupa PNG.');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function examplePublicUrl(env, path) {
  return `${storageBaseUrl(env)}/object/public/${EXAMPLE_JOBS_BUCKET}/${encodeStoragePath(path)}`;
}

function handleHealth(env) {
  return json({
    ok: true,
    service: 'design-mudah',
    message: 'Worker API aktif. Gunakan endpoint /api/... dari aplikasi frontend.',
    config: {
      supabaseUrl: hasEnvValue(env, 'SUPABASE_URL'),
      supabaseServiceRoleKey: hasEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
      litellmBaseUrl: hasEnvValue(env, 'LITELLM_BASE_URL'),
      litellmSecretKey: hasEnvValue(env, 'LITELLM_SECRET_KEY'),
      imageModels: imageModelCandidates(env)
    },
    endpoints: [
      'GET /api/me/balance',
      'POST /api/jobs/quote',
      'POST /api/jobs/commit',
      'POST /api/image-retouch'
    ]
  });
}

async function supabaseFetch(env, path, { method = 'GET', token, body, prefer } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
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

async function storageFetch(env, path, { method = 'GET', body, headers = {} } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${storageBaseUrl(env)}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...headers
    },
    body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || data?.msg || `Supabase storage request failed: ${response.status}`);
  }
  return data;
}

async function uploadStorageObject(env, bucket, path, bytes, contentType) {
  return storageFetch(env, `/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': contentType,
      'cache-control': '3600',
      'x-upsert': 'true'
    }
  });
}

async function deleteStorageObjects(env, bucket, prefixes) {
  const filtered = [...new Set((prefixes || []).filter(Boolean))];
  if (filtered.length === 0) return null;
  return storageFetch(env, `/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    body: JSON.stringify({ prefixes: filtered }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function copyStorageObject(env, bucket, sourceKey, destinationKey) {
  return storageFetch(env, '/object/copy', {
    method: 'POST',
    body: JSON.stringify({
      bucketId: bucket,
      sourceKey,
      destinationKey
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function getPricing(env) {
  try {
    const rows = await supabaseFetch(env, '/rest/v1/pricing_rules?select=key,amount_idr,active,description&order=key.asc', {});
    return rows.reduce(
      (pricing, row) => ({
        ...pricing,
        [row.key]: row.active === false ? pricing[row.key] : Number(row.amount_idr) || pricing[row.key]
      }),
      { ...DEFAULT_PRICING }
    );
  } catch (_err) {
    return { ...DEFAULT_PRICING };
  }
}

async function getAppSetting(env, key) {
  const rows = await supabaseFetch(env, `/rest/v1/app_settings?select=key,value,is_public,description,updated_at&key=eq.${encodeURIComponent(key)}&limit=1`, {});
  return rows?.[0] || null;
}

async function upsertAppSetting(env, { key, value, isPublic = true, description = '' }) {
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key,
      value,
      is_public: isPublic,
      description,
      updated_at: formatDate(new Date())
    }
  });
  return rows?.[0] || null;
}

async function listProfilesWithBalance(env) {
  const rows = await supabaseFetch(env, '/rest/v1/profiles?select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at&order=created_at.desc', {});
  return Promise.all(
    rows.map(async (profile) => ({
      ...profile,
      balance: profile.is_unlimited ? null : await creditBalance(env, profile.id)
    }))
  );
}

function withUserEmails(rows, users) {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    ...row,
    user_email: emailById.get(row.user_id) || ''
  }));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isProtectedSuperuser(profile) {
  return normalizeEmail(profile?.email) === SUPERUSER_EMAIL;
}

function sanitizeUserPatch(patch = {}, existingProfile) {
  const allowed = {};
  for (const key of ['full_name', 'role', 'is_unlimited', 'is_active', 'deleted_at']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  if (isProtectedSuperuser(existingProfile)) {
    delete allowed.role;
    delete allowed.is_unlimited;
    delete allowed.is_active;
    delete allowed.deleted_at;
  }
  return allowed;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function supabaseAuthAdminFetch(env, path, { method = 'GET', body } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error?.message || `Supabase auth admin request failed: ${response.status}`);
  }
  return data;
}

async function getUser(env, request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Login dibutuhkan.');
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error('Session tidak valid.');
  return { token, user };
}

async function getProfile(env, userId) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at`,
    {}
  );
  const profile = rows?.[0];
  if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
  return profile;
}

async function getProfileRaw(env, userId) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at`,
    {}
  );
  return rows?.[0] || null;
}

async function waitForProfile(env, userId, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    const profile = await getProfileRaw(env, userId);
    if (profile) return profile;
    if (index < attempts - 1) await sleep(200);
  }
  throw new Error('Profile user baru belum muncul di database.');
}

async function requireUser(env, request) {
  const auth = await getUser(env, request);
  const profile = await getProfile(env, auth.user.id);
  return { ...auth, profile };
}

async function requireAdmin(env, request) {
  const auth = await requireUser(env, request);
  if (auth.profile.role !== 'superuser' && auth.user.email?.toLowerCase() !== SUPERUSER_EMAIL) {
    throw new Error('Akses admin ditolak.');
  }
  return auth;
}

async function creditBalance(env, userId) {
  const rows = await supabaseFetch(env, `/rest/v1/rpc/credit_balance`, {
    method: 'POST',
    body: { target_user_id: userId }
  });
  return Number(rows || 0);
}

async function insertLedger(env, { userId, amountIdr, kind, reason, referenceId, createdBy, metadata }) {
  const rows = await supabaseFetch(env, '/rest/v1/credit_ledger?select=id', {
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

async function ensureCredit(env, profile, priceIdr) {
  if (profile.is_unlimited) return { isUnlimited: true, balance: null };
  const balance = await creditBalance(env, profile.id);
  if (balance < priceIdr) throw new Error(`Saldo kurang. Dibutuhkan Rp${priceIdr}, saldo Rp${balance}.`);
  return { isUnlimited: false, balance };
}

async function handleBalance(env, request) {
  const { profile } = await requireUser(env, request);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ profile, balance, isUnlimited: profile.is_unlimited });
}

async function handleQuote(env, request) {
  const { profile } = await requireUser(env, request);
  const body = await readJson(request);
  const pricing = await getPricing(env);
  const priceIdr = calculateDynamicJobPrice(body, pricing);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ priceIdr, balance, isUnlimited: profile.is_unlimited, canRun: profile.is_unlimited || balance >= priceIdr });
}

async function handleCommitJob(env, request) {
  const { user, profile } = await requireUser(env, request);
  const body = await readJson(request);
  const pricing = await getPricing(env);
  const priceIdr = calculateDynamicJobPrice({
    inputMode: body.inputMode,
    separationFilmCount: body.separationFilmCount,
    aiAlreadyCharged: body.inputMode === 'ai_redraw'
  }, pricing);
  await ensureCredit(env, profile, priceIdr);

  const jobRows = await supabaseFetch(env, '/rest/v1/jobs?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: user.id,
      project_name: body.projectName || 'Project Vector',
      input_mode: body.inputMode,
      production_type: body.productionType,
      status: 'done',
      price_idr: (body.inputMode === 'ai_redraw' ? pricing.ai_redraw : 0) + priceIdr,
      separation_film_count: Number(body.separationFilmCount) || 0,
      settings: body.settings || {},
      manifest: body.manifest || {},
      ai_ledger_id: body.aiLedgerId || null
    }
  });
  let job = jobRows?.[0];

  if (job && body.examplePreviewDataUrl && isSuperuserProfile(profile, user.email)) {
    try {
      const sourcePath = exampleSourcePath(job.id);
      await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, sourcePath, dataUrlToUint8Array(body.examplePreviewDataUrl), 'image/png');
      const manifest = {
        ...(job.manifest || {}),
        examplePreviewSourcePath: sourcePath
      };
      const updatedRows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(job.id)}&select=*`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { manifest }
      });
      job = updatedRows?.[0] || { ...job, manifest };
    } catch (error) {
      console.error('Failed to store example preview source', error);
    }
  }

  if (!profile.is_unlimited && priceIdr > 0) {
    await insertLedger(env, {
      userId: user.id,
      amountIdr: -priceIdr,
      kind: 'debit',
      reason: 'job_commit',
      referenceId: job.id,
      metadata: { inputMode: body.inputMode, separationFilmCount: body.separationFilmCount }
    });
  }

  return json({ job, chargedIdr: priceIdr, isUnlimited: profile.is_unlimited });
}

async function handleAiRedraw(env, request) {
  const { user, profile } = await requireUser(env, request);
  const pricing = await getPricing(env);
  await ensureCredit(env, profile, pricing.ai_redraw);
  const form = await request.formData();
  const image = form.get('image');
  const settings = JSON.parse(form.get('settings') || '{}');
  if (!(image instanceof File)) throw new Error('File gambar wajib diisi.');

  let ledger = null;
  if (!profile.is_unlimited) {
    ledger = await insertLedger(env, {
      userId: user.id,
      amountIdr: -pricing.ai_redraw,
      kind: 'debit',
      reason: 'ai_redraw',
      metadata: { inputMode: settings.inputMode, productionType: settings.productionType }
    });
  }

  const { b64, ledgerId } = await requestRetouchedImage(env, image, settings, ledger?.id || '');
  const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/png',
      'X-AI-Ledger-Id': ledgerId
    }
  });
}

async function requestRetouchedImage(env, image, settings, ledgerId) {
  const errors = [];

  for (const model of imageModelCandidates(env)) {
    const aiForm = new FormData();
    aiForm.append('image', image, image.name || 'input.png');
    aiForm.append('prompt', buildAiPrompt(settings));
    aiForm.append('model', model);
    aiForm.append('size', '1024x1024');

    const response = await fetch(litellmImagesUrl(env), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnvValue(env, 'LITELLM_SECRET_KEY')}`
      },
      body: aiForm
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      errors.push(`${model}: ${data?.error?.message || 'Gambar ulang gagal.'}`);
      continue;
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      errors.push(`${model}: Layanan gambar ulang tidak mengembalikan gambar.`);
      continue;
    }

    return { b64, ledgerId };
  }

  throw new Error(`Gambar ulang gagal. ${errors.join(' | ')}`);
}

function buildAiPrompt(settings) {
  return [
    'Faithfully redraw the uploaded image as a clean flat vector-style illustration for sticker and manual screen printing.',
    'Preserve composition, text, proportions, visible colors, and dark backgrounds.',
    'Use solid flat colors only. No gradients, no shadows, no texture, no blur.',
    settings.productionType === 'sablon'
      ? 'Optimize for clean spot-color screen print separation.'
      : 'Optimize for full-color sticker output with clean edges.'
  ].join('\n\n');
}

async function handleAdminUsers(env, request) {
  const admin = await requireAdmin(env, request);
  if (request.method === 'GET') {
    return json({ users: await listProfilesWithBalance(env) });
  }

  const body = await readJson(request);
  if (body.action === 'create') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();
    const initialCreditIdr = Math.max(0, Number.parseInt(body.initialCreditIdr, 10) || 0);

    if (!email || !email.includes('@')) throw new Error('Email user baru tidak valid.');
    if (password.length < 6) throw new Error('Password minimal 6 karakter.');

    const created = await supabaseAuthAdminFetch(env, '/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email.split('@')[0]
        }
      }
    });

    const profile = await waitForProfile(env, created.user?.id);
    const patch = sanitizeUserPatch(
      {
        full_name: fullName || profile.full_name,
        role: body.role || 'user',
        is_unlimited: body.isUnlimited === true,
        is_active: body.isActive !== false,
        deleted_at: body.isActive === false ? new Date().toISOString() : null
      },
      profile
    );

    let updatedProfile = profile;
    if (Object.keys(patch).length > 0) {
      const rows = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}&select=*`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patch
      });
      updatedProfile = rows?.[0] || profile;
    }

    if (initialCreditIdr > 0 && !updatedProfile.is_unlimited) {
      await insertLedger(env, {
        userId: updatedProfile.id,
        amountIdr: initialCreditIdr,
        kind: 'credit',
        reason: 'admin_user_creation_credit',
        createdBy: admin.user.id,
        metadata: { source: 'admin_create_user' }
      });
    }

    return json({
      user: {
        ...updatedProfile,
        balance: updatedProfile.is_unlimited ? null : await creditBalance(env, updatedProfile.id)
      }
    });
  }

  if (!body.userId) throw new Error('User ID wajib diisi.');
  const existingProfile = await getProfileRaw(env, body.userId);
  if (!existingProfile) throw new Error('User tidak ditemukan.');

  if (body.action === 'delete') {
    if (body.userId === admin.user.id) throw new Error('Akun yang sedang dipakai tidak bisa dihapus.');
    if (isProtectedSuperuser(existingProfile)) throw new Error('Akun whitelist utama tidak bisa dihapus.');
    await supabaseAuthAdminFetch(env, `/admin/users/${encodeURIComponent(body.userId)}`, {
      method: 'DELETE'
    });
    return json({ deleted: true, userId: body.userId });
  }

  const allowed = sanitizeUserPatch(body.patch || {}, existingProfile);
  if (!Object.keys(allowed).length) {
    return json({
      user: {
        ...existingProfile,
        balance: existingProfile.is_unlimited ? null : await creditBalance(env, existingProfile.id)
      }
    });
  }

  const rows = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(body.userId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: allowed
  });
  const user = rows?.[0];
  return json({
    user: {
      ...user,
      balance: user?.is_unlimited ? null : await creditBalance(env, user.id)
    }
  });
}

async function handleCreateManualPayment(env, request) {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) throw new Error('Nominal pembayaran tidak valid.');
  const rows = await supabaseFetch(env, '/rest/v1/manual_payments?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: user.id,
      marketplace: 'shopee',
      order_ref: body.orderRef || '',
      amount_idr: amountIdr,
      notes: body.notes || '',
      status: 'pending'
    }
  });
  return json({ payment: rows?.[0] });
}

async function handleAppConfig(env) {
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=key,value,is_public&is_public=eq.true&order=key.asc', {});
  return json({ settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
}

async function handleAdminOverview(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, payments, ledger] = await Promise.all([
    supabaseFetch(env, '/rest/v1/profiles?select=id,is_active,is_unlimited,deleted_at', {}),
    supabaseFetch(env, '/rest/v1/jobs?select=id,price_idr,production_type,input_mode,created_at&order=created_at.desc&limit=500', {}),
    supabaseFetch(env, '/rest/v1/manual_payments?select=id,status,amount_idr,created_at&order=created_at.desc&limit=500', {}),
    supabaseFetch(env, '/rest/v1/credit_ledger?select=amount_idr,kind,reason,created_at&order=created_at.desc&limit=500', {})
  ]);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentJobs = jobs.filter((job) => new Date(job.created_at).getTime() >= sevenDaysAgo);
  return json({
    overview: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.is_active && !user.deleted_at).length,
      unlimitedUsers: users.filter((user) => user.is_unlimited).length,
      totalJobs: jobs.length,
      jobsLast7Days: recentJobs.length,
      totalJobValueIdr: jobs.reduce((sum, job) => sum + (Number(job.price_idr) || 0), 0),
      pendingPayments: payments.filter((payment) => payment.status === 'pending').length,
      approvedPayments: payments.filter((payment) => payment.status === 'approved').length,
      approvedPaymentIdr: payments.filter((payment) => payment.status === 'approved').reduce((sum, payment) => sum + (Number(payment.amount_idr) || 0), 0),
      creditAddedIdr: ledger.filter((entry) => entry.amount_idr > 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0),
      creditUsedIdr: Math.abs(ledger.filter((entry) => entry.amount_idr < 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0))
    }
  });
}

async function handleAdminJobs(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, exampleSetting] = await Promise.all([
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {}),
    supabaseFetch(env, '/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest&order=created_at.desc&limit=100', {}),
    getAppSetting(env, 'example_jobs')
  ]);
  const decorated = decorateAdminJobs(jobs, users, exampleSetting?.value);
  return json({
    jobs: decorated.map(({ manifest, ...job }) => job)
  });
}

async function handleAdminPayments(env, request) {
  await requireAdmin(env, request);
  const users = await supabaseFetch(env, '/rest/v1/profiles?select=id,email', {});
  const payments = await supabaseFetch(env, '/rest/v1/manual_payments?select=id,user_id,marketplace,order_ref,amount_idr,status,notes,rejected_reason,approved_at,created_at,updated_at&order=created_at.desc&limit=100', {});
  return json({ payments: withUserEmails(payments, users) });
}

async function handleRejectPayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request);
  const updated = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: 'rejected',
      rejected_reason: body.reason || '',
      approved_by: admin.user.id,
      approved_at: null
    }
  });
  return json({ payment: updated?.[0] });
}

async function handleAdminPricingRules(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rules = await supabaseFetch(env, '/rest/v1/pricing_rules?select=key,amount_idr,active,description,updated_at&order=key.asc', {});
    return json({ rules });
  }

  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!body.key || !Number.isInteger(amountIdr) || amountIdr < 0) throw new Error('Aturan harga tidak valid.');
  const rows = await supabaseFetch(env, '/rest/v1/pricing_rules?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key: body.key,
      amount_idr: amountIdr,
      active: body.active !== false,
      description: body.description || '',
      updated_at: formatDate(new Date())
    }
  });
  return json({ rule: rows?.[0] });
}

async function handleAdminSettings(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=key,value,is_public,description,updated_at&order=key.asc', {});
    return json({ settings: rows });
  }

  const body = await readJson(request);
  if (!body.key) throw new Error('Key setting wajib diisi.');
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key: body.key,
      value: body.value || {},
      is_public: body.isPublic !== false,
      description: body.description || '',
      updated_at: formatDate(new Date())
    }
  });
  return json({ setting: rows?.[0] });
}

async function handleSetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [jobRows, profiles, exampleSetting] = await Promise.all([
    supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=id,user_id,production_type,status,manifest&limit=1`, {}),
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {}),
    getAppSetting(env, 'example_jobs')
  ]);

  const job = jobRows?.[0];
  if (!job) throw new Error('Job tidak ditemukan.');
  if (job.status !== 'done') throw new Error('Hanya job selesai yang bisa dijadikan contoh.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || owner.role !== 'superuser') throw new Error('Hanya job milik superadmin yang bisa dijadikan contoh.');

  const sourcePath = getExampleSourcePathFromManifest(job.manifest);
  if (!sourcePath) throw new Error('Job ini belum punya preview sumber contoh. Buat ulang job sebagai superadmin setelah fitur ini aktif.');

  const destinationPath = exampleActivePath(job.production_type);
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  const currentPath = currentExamples[job.production_type]?.storagePath;

  await deleteStorageObjects(env, EXAMPLE_JOBS_BUCKET, [currentPath, destinationPath].filter(Boolean));
  await copyStorageObject(env, EXAMPLE_JOBS_BUCKET, sourcePath, destinationPath);

  const nextExamples = updateExampleJobsSetting(currentExamples, job.production_type, {
    jobId: job.id,
    imageUrl: examplePublicUrl(env, destinationPath),
    storagePath: destinationPath,
    updatedAt: new Date().toISOString()
  });

  await upsertAppSetting(env, {
    key: 'example_jobs',
    value: nextExamples,
    isPublic: true,
    description: 'Contoh gambar aktif untuk sticker dan sablon'
  });

  return json({
    jobId: job.id,
    productionType: job.production_type,
    exampleJobs: nextExamples
  });
}

async function handleAdminCredits(env, request) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!body.userId || !Number.isInteger(amountIdr) || amountIdr === 0) throw new Error('Nominal credit tidak valid.');
  const ledger = await insertLedger(env, {
    userId: body.userId,
    amountIdr,
    kind: amountIdr > 0 ? 'credit' : 'debit',
    reason: body.reason || 'admin_adjustment',
    createdBy: admin.user.id,
    metadata: body.metadata || {}
  });
  return json({ ledger });
}

async function handleApprovePayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const rows = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {});
  const payment = rows?.[0];
  if (!payment) throw new Error('Pembayaran tidak ditemukan.');
  if (payment.status === 'approved') return json({ payment });
  await insertLedger(env, {
    userId: payment.user_id,
    amountIdr: payment.amount_idr,
    kind: 'credit',
    reason: 'manual_payment_shopee',
    referenceId: payment.id,
    createdBy: admin.user.id
  });
  const updated = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status: 'approved', approved_by: admin.user.id, approved_at: new Date().toISOString() }
  });
  return json({ payment: updated?.[0] });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    try {
      if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return handleHealth(env);
      if (url.pathname === '/api/app-config' && request.method === 'GET') return await handleAppConfig(env);
      if (url.pathname === '/api/manual-payments' && request.method === 'POST') return await handleCreateManualPayment(env, request);
      if (url.pathname === '/api/me/balance' && request.method === 'GET') return await handleBalance(env, request);
      if (url.pathname === '/api/jobs/quote' && request.method === 'POST') return await handleQuote(env, request);
      if (url.pathname === '/api/jobs/commit' && request.method === 'POST') return await handleCommitJob(env, request);
      if ((url.pathname === '/api/image-retouch' || url.pathname === '/api/ai-redraw') && request.method === 'POST') return await handleAiRedraw(env, request);
      if (url.pathname === '/api/admin/users') return await handleAdminUsers(env, request);
      if (url.pathname === '/api/admin/credits' && request.method === 'POST') return await handleAdminCredits(env, request);
      if (url.pathname === '/api/admin/overview' && request.method === 'GET') return await handleAdminOverview(env, request);
      if (url.pathname === '/api/admin/jobs' && request.method === 'GET') return await handleAdminJobs(env, request);
      if (url.pathname === '/api/admin/manual-payments' && request.method === 'GET') return await handleAdminPayments(env, request);
      if (url.pathname === '/api/admin/pricing-rules') return await handleAdminPricingRules(env, request);
      if (url.pathname === '/api/admin/settings') return await handleAdminSettings(env, request);
      const setExampleMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/set-example$/);
      if (setExampleMatch && request.method === 'POST') return await handleSetExampleJob(env, request, setExampleMatch[1]);
      const approveMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/approve$/);
      if (approveMatch && request.method === 'POST') return await handleApprovePayment(env, request, approveMatch[1]);
      const rejectMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/reject$/);
      if (rejectMatch && request.method === 'POST') return await handleRejectPayment(env, request, rejectMatch[1]);
      return error('Endpoint tidak ditemukan.', 404);
    } catch (err) {
      return error(err.message || 'Server error.', err.message?.includes('ditolak') ? 403 : 400);
    }
  }
};
