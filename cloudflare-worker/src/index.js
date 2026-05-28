import { AI_REDRAW_PRICE_IDR, SUPERUSER_EMAIL } from './pricing.js';
import {
  decorateAdminJobs,
  EXAMPLE_JOBS_BUCKET,
  getExampleArtifactsFromManifest,
  hasCompleteExampleArtifacts,
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
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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

function examplePublicUrl(env, path) {
  return `${storageBaseUrl(env)}/object/public/${EXAMPLE_JOBS_BUCKET}/${encodeStoragePath(path)}`;
}

function exampleJobPath(jobId, filename) {
  return `jobs/${jobId}/${filename}`;
}

function exampleJobPrefix(jobId) {
  return `jobs/${jobId}`;
}

function notDeletedQuery(column = 'deleted_at') {
  return `${column}=is.null`;
}

function jobIsDeleted(job = {}) {
  return Boolean(job?.deleted_at);
}

function isMissingJobsPublishColumnsError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(is_example_public|example_published_at|deleted_at)/i.test(message) && /(jobs|column|schema cache)/i.test(message);
}

function withLegacyJobPublishDefaults(rows = []) {
  return (rows || []).map((row) => ({
    ...row,
    is_example_public: row?.is_example_public === true,
    example_published_at: row?.example_published_at || null,
    deleted_at: row?.deleted_at || null
  }));
}

async function queryJobsWithPublishFallback(env, primaryPath, fallbackPath) {
  try {
    return await supabaseFetch(env, primaryPath, {});
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error) || !fallbackPath) throw error;
    const legacyRows = await supabaseFetch(env, fallbackPath, {});
    return withLegacyJobPublishDefaults(legacyRows);
  }
}

async function getJobByIdWithPublishFallback(env, jobId, baseSelect, fallbackSelect = baseSelect) {
  const primaryPath = `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=${baseSelect}&limit=1`;
  const fallbackPath = `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=${fallbackSelect}&limit=1`;
  const rows = await queryJobsWithPublishFallback(env, primaryPath, fallbackPath);
  return rows?.[0] || null;
}

async function patchJobPublishState(env, jobId, patch, fallbackJob) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=*`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    });
    return {
      job: rows?.[0] || { ...fallbackJob, ...patch },
      usedLegacyFallback: false
    };
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error)) throw error;
    return {
      job: {
        ...fallbackJob,
        ...patch
      },
      usedLegacyFallback: true
    };
  }
}

async function softDeleteJobWithFallback(env, jobId, deletedAt, fallbackJob) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=*`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        deleted_at: deletedAt,
        is_example_public: false,
        example_published_at: null
      }
    });
    return {
      job: rows?.[0] || { ...fallbackJob, deleted_at: deletedAt, is_example_public: false, example_published_at: null },
      usedLegacyFallback: false
    };
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error)) throw error;
    return {
      job: {
        ...fallbackJob,
        deleted_at: deletedAt,
        is_example_public: false,
        example_published_at: null
      },
      usedLegacyFallback: true
    };
  }
}

function buildLegacyExampleSettingEntry(env, job, artifacts) {
  const resultPreviewUrl = artifacts?.files?.fullPng || (artifacts?.resultPreviewPath ? examplePublicUrl(env, artifacts.resultPreviewPath) : '');
  const sourcePreviewUrl = artifacts?.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : '';
  return {
    jobId: job.id,
    projectName: artifacts?.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: artifacts?.inputMode || job.input_mode,
    imageUrl: resultPreviewUrl,
    sourcePreviewUrl,
    resultPreviewUrl,
    files: artifacts?.files || {},
    separations: artifacts?.separations || [],
    settings: artifacts?.settings || job.settings || {},
    updatedAt: formatDate(new Date())
  };
}

async function syncLegacyExampleSetting(env, job, artifacts) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  const nextExamples = updateExampleJobsSetting(currentExamples, job.production_type, buildLegacyExampleSettingEntry(env, job, artifacts));
  await upsertAppSetting(env, {
    key: 'example_jobs',
    value: nextExamples,
    isPublic: true,
    description: 'Contoh gambar aktif untuk sticker dan sablon'
  });
  return nextExamples;
}

async function clearLegacyExampleSettingIfMatches(env, job) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  if (currentExamples[job.production_type]?.jobId !== job.id) {
    return currentExamples;
  }
  const nextExamples = updateExampleJobsSetting(currentExamples, job.production_type, null);
  await upsertAppSetting(env, {
    key: 'example_jobs',
    value: nextExamples,
    isPublic: true,
    description: 'Contoh gambar aktif untuk sticker dan sablon'
  });
  return nextExamples;
}

async function listLegacyPublishedExampleJobs(env) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  const entries = Object.values(currentExamples).filter((entry) => entry?.jobId);
  if (entries.length === 0) return [];

  const jobIds = [...new Set(entries.map((entry) => entry.jobId).filter(Boolean))];
  const jobRows =
    jobIds.length > 0
      ? await supabaseFetch(
          env,
          `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at&id=in.(${jobIds.join(',')})&status=eq.done&order=created_at.desc&limit=50`,
          {}
        )
      : [];
  const jobsById = new Map((jobRows || []).map((job) => [job.id, job]));

  return entries
    .map((entry) => {
      const job = jobsById.get(entry.jobId);
      if (!job) return null;
      if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) return null;

      const artifacts = getExampleArtifactsFromManifest(job.manifest);
      return {
        jobId: job.id,
        projectName: entry.projectName || artifacts?.projectName || job.project_name,
        productionType: entry.productionType || job.production_type,
        inputMode: entry.inputMode || artifacts?.inputMode || job.input_mode,
        sourcePreviewUrl: entry.sourcePreviewUrl || (artifacts?.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : ''),
        resultPreviewUrl: entry.resultPreviewUrl || entry.imageUrl || artifacts?.files?.fullPng || '',
        files: Object.keys(entry.files || {}).length > 0 ? entry.files : artifacts?.files || {},
        separations: Array.isArray(entry.separations) && entry.separations.length > 0 ? entry.separations : artifacts?.separations || [],
        settings: entry.settings || artifacts?.settings || job.settings || {},
        createdAt: job.created_at,
        updatedAt: entry.updatedAt || artifacts?.updatedAt || job.created_at,
        ownerId: job.user_id,
        isExamplePublic: true
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

function toExampleFeedJob(env, job) {
  if (!job || job.status !== 'done' || job.is_example_public !== true || jobIsDeleted(job)) return null;
  if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) return null;

  const artifacts = getExampleArtifactsFromManifest(job.manifest);
  if (!artifacts) return null;

  return {
    jobId: job.id,
    projectName: artifacts.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: artifacts.inputMode || job.input_mode,
    sourcePreviewUrl: artifacts.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : '',
    resultPreviewUrl: artifacts.files?.fullPng || (artifacts.resultPreviewPath ? examplePublicUrl(env, artifacts.resultPreviewPath) : ''),
    files: artifacts.files || {},
    separations: artifacts.separations || [],
    settings: artifacts.settings || job.settings || {},
    createdAt: job.created_at,
    updatedAt: job.example_published_at || artifacts.updatedAt || job.created_at,
    ownerId: job.user_id,
    isExamplePublic: true
  };
}

async function fileToUint8Array(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function requireFormFile(formData, key, message) {
  const file = formData.get(key);
  if (!(file instanceof File)) throw new Error(message);
  return file;
}

function optionalFormFile(formData, key) {
  const file = formData.get(key);
  return file instanceof File ? file : null;
}

function normalizeArtifactManifestInput(value, fallback = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    projectName: typeof input.projectName === 'string' ? input.projectName : fallback.projectName || 'Project Vector',
    productionType: typeof input.productionType === 'string' ? input.productionType : fallback.productionType || 'sticker',
    inputMode: typeof input.inputMode === 'string' ? input.inputMode : fallback.inputMode || 'ready_trace',
    settings: input.settings && typeof input.settings === 'object' ? input.settings : fallback.settings || {},
    sourceFileName: typeof input.sourceFileName === 'string' ? input.sourceFileName : '',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    separations: Array.isArray(input.separations)
      ? input.separations.map((separation) => ({
          index: separation.index,
          kind: typeof separation.kind === 'string' ? separation.kind : 'color',
          hex: typeof separation.hex === 'string' ? separation.hex : '#000000',
          label: typeof separation.label === 'string' ? separation.label : ''
        }))
      : []
  };
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
      'DELETE /api/jobs/:jobId',
      'POST /api/jobs/:jobId/artifacts',
      'GET /api/example-jobs',
      'POST /api/admin/jobs/:jobId/set-example',
      'POST /api/admin/jobs/:jobId/unset-example',
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

export function buildAiPrompt(settings) {
  return [
    'Faithfully redraw only the actual artwork from the uploaded photo as a fresh clean cartoon/vector illustration for sticker and manual screen printing.',
    'This is a true redraw from shapes and colors, not pixel repair, not upscaling, not sharpening, and not automatic photo cleanup. Rebuild the artwork with smooth intentional vector-like shapes.',
    'Treat the uploaded image as a reference photo. Separate the real design from camera background, paper, table, shadows, glare, uneven lighting, light gradients, blur, compression noise, and dirt.',
    'Do not preserve photographic background, lighting gradients, glow, shadow, paper texture, table color, or empty canvas outside the design. Make all non-artwork outside the silhouette pure white or transparent-looking and non-printing.',
    'Preserve composition, text, proportions, important visible colors, and deliberate design shapes. Preserve a dark or colored background only when it is clearly an intentional bounded shape inside the artwork, not a photo backdrop.',
    'Use solid flat colors only. No gradients, no shadows, no texture, no blur, no halftone, no noisy edge pixels.',
    'Make the outermost artwork silhouette smooth, clean, closed, continuous, and easy to trace into vector shapes. Use rounded, intentional contours instead of rough pixel-like edges.',
    'For text and logos, redraw the letterforms as clean bold shapes with smooth contours. Do not preserve pixel damage, rough source edges, gray anti-alias dust, or lighting artifacts.',
    'Avoid jagged outer contours, wavy borders, accidental rough corners, broken outlines, fringing, glow, anti-aliased halos, and noisy edge artifacts.',
    settings.productionType === 'sablon'
      ? 'Optimize for clean spot-color screen print separation. Every color region must be intentional printable artwork; do not create any separate film for the photo background or lighting gradient.'
      : 'Optimize for full-color sticker output with crisp smooth edges suitable for vector tracing and cutline generation.'
  ].join('\n\n');
}

async function handleJobArtifactsUpload(env, request, jobId) {
  const { user, profile } = await requireUser(env, request);
  if (!isSuperuserProfile(profile, user.email)) {
    throw new Error('Hanya superadmin yang boleh mengunggah artefak contoh.');
  }

  const job = await getJobByIdWithPublishFallback(
    env,
    jobId,
    'id,user_id,project_name,input_mode,production_type,status,settings,manifest,deleted_at',
    'id,user_id,project_name,input_mode,production_type,status,settings,manifest'
  );
  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');
  if (job.user_id !== user.id) throw new Error('Hanya job milik Anda sendiri yang boleh dijadikan contoh.');
  if (job.status !== 'done') throw new Error('Artefak contoh hanya boleh diunggah untuk job yang sudah selesai.');

  const form = await request.formData();
  const manifestInput = normalizeArtifactManifestInput(JSON.parse(String(form.get('manifest') || '{}')), {
    projectName: job.project_name,
    productionType: job.production_type,
    inputMode: job.input_mode,
    settings: job.settings || {}
  });
  const manifest = {
    ...manifestInput,
    projectName: manifestInput.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: job.input_mode,
    settings: manifestInput.settings || job.settings || {}
  };

  const sourcePreview = requireFormFile(form, 'sourcePreview', 'Preview gambar awal wajib diunggah.');
  const fullPng = requireFormFile(form, 'fullPng', 'Preview hasil PNG wajib diunggah.');
  const fullSvg = requireFormFile(form, 'fullSvg', 'File SVG full color wajib diunggah.');
  const fullPdf = requireFormFile(form, 'fullPdf', 'File PDF full color wajib diunggah.');
  const zip = requireFormFile(form, 'zip', 'ZIP hasil lengkap wajib diunggah.');
  const separationZip = optionalFormFile(form, 'separationZip');
  const stickerCutlineSvg = optionalFormFile(form, 'stickerCutlineSvg');
  const stickerCutlinePdf = optionalFormFile(form, 'stickerCutlinePdf');

  const separationSvgs = form.getAll('separationSvg').filter((file) => file instanceof File);
  const separationPdfs = form.getAll('separationPdf').filter((file) => file instanceof File);
  const separationPreviews = form.getAll('separationPreview').filter((file) => file instanceof File);

  if (manifest.productionType === 'sablon') {
    if (!(separationZip instanceof File)) throw new Error('ZIP film sablon wajib diunggah untuk contoh sablon.');
    if (manifest.separations.length === 0) throw new Error('Contoh sablon wajib memiliki daftar film.');
  }

  if (manifest.separations.length > 0) {
    if (separationSvgs.length !== manifest.separations.length || separationPdfs.length !== manifest.separations.length || separationPreviews.length !== manifest.separations.length) {
      throw new Error('Jumlah file film contoh tidak cocok dengan manifest.');
    }
  }

  const sourcePreviewPath = exampleJobPath(job.id, 'source-preview.png');
  const resultPreviewPath = exampleJobPath(job.id, 'preview-full-color.png');
  const fullSvgPath = exampleJobPath(job.id, 'full-vector.svg');
  const fullPdfPath = exampleJobPath(job.id, 'full-vector.pdf');
  const stickerCutlineSvgPath = stickerCutlineSvg ? exampleJobPath(job.id, 'sticker-cutline.svg') : '';
  const stickerCutlinePdfPath = stickerCutlinePdf ? exampleJobPath(job.id, 'sticker-cutline.pdf') : '';
  const zipPath = exampleJobPath(job.id, 'result.zip');
  const separationZipPath = separationZip ? exampleJobPath(job.id, 'separation-films.zip') : '';
  const manifestPath = exampleJobPath(job.id, 'manifest.json');

  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, sourcePreviewPath, await fileToUint8Array(sourcePreview), sourcePreview.type || 'image/png');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, resultPreviewPath, await fileToUint8Array(fullPng), fullPng.type || 'image/png');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, fullSvgPath, await fileToUint8Array(fullSvg), fullSvg.type || 'image/svg+xml');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, fullPdfPath, await fileToUint8Array(fullPdf), fullPdf.type || 'application/pdf');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, zipPath, await fileToUint8Array(zip), zip.type || 'application/zip');

  if (stickerCutlineSvgPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlineSvgPath, await fileToUint8Array(stickerCutlineSvg), stickerCutlineSvg.type || 'image/svg+xml');
  }
  if (stickerCutlinePdfPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlinePdfPath, await fileToUint8Array(stickerCutlinePdf), stickerCutlinePdf.type || 'application/pdf');
  }
  if (separationZipPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, separationZipPath, await fileToUint8Array(separationZip), separationZip.type || 'application/zip');
  }

  const uploadedSeparations = [];
  for (let index = 0; index < manifest.separations.length; index += 1) {
    const separation = manifest.separations[index];
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    const svgPath = exampleJobPath(job.id, `separations/film-${slug}.svg`);
    const pdfPath = exampleJobPath(job.id, `separations/film-${slug}.pdf`);
    const previewPath = exampleJobPath(job.id, `separations/film-${slug}-preview.png`);

    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, svgPath, await fileToUint8Array(separationSvgs[index]), separationSvgs[index].type || 'image/svg+xml');
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, pdfPath, await fileToUint8Array(separationPdfs[index]), separationPdfs[index].type || 'application/pdf');
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, previewPath, await fileToUint8Array(separationPreviews[index]), separationPreviews[index].type || 'image/png');

    uploadedSeparations.push({
      index: separation.index,
      kind: separation.kind || 'color',
      hex: separation.hex || '#000000',
      label: separation.label || '',
      svg: examplePublicUrl(env, svgPath),
      pdf: examplePublicUrl(env, pdfPath),
      preview: examplePublicUrl(env, previewPath),
      previewPng: examplePublicUrl(env, previewPath)
    });
  }

  const exampleArtifacts = {
    version: 1,
    projectName: manifest.projectName,
    productionType: manifest.productionType,
    inputMode: manifest.inputMode,
    settings: manifest.settings || {},
    sourcePreviewPath,
    resultPreviewPath,
    manifestPath,
    files: {
      fullPng: examplePublicUrl(env, resultPreviewPath),
      fullSvg: examplePublicUrl(env, fullSvgPath),
      fullPdf: examplePublicUrl(env, fullPdfPath),
      stickerCutlineSvg: stickerCutlineSvgPath ? examplePublicUrl(env, stickerCutlineSvgPath) : '',
      stickerCutlinePdf: stickerCutlinePdfPath ? examplePublicUrl(env, stickerCutlinePdfPath) : '',
      zip: examplePublicUrl(env, zipPath),
      separationZip: separationZipPath ? examplePublicUrl(env, separationZipPath) : ''
    },
    separations: uploadedSeparations,
    updatedAt: new Date().toISOString()
  };

  await uploadStorageObject(
    env,
    EXAMPLE_JOBS_BUCKET,
    manifestPath,
    new TextEncoder().encode(
      JSON.stringify(
        {
          ...manifest,
          sourcePreviewUrl: examplePublicUrl(env, sourcePreviewPath),
          resultPreviewUrl: examplePublicUrl(env, resultPreviewPath),
          files: exampleArtifacts.files,
          separations: uploadedSeparations
        },
        null,
        2
      )
    ),
    'application/json'
  );

  const nextManifest = {
    ...(job.manifest || {}),
    exampleArtifacts
  };
  const updatedRows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(job.id)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { manifest: nextManifest }
  });

  return json({
    jobId: job.id,
    exampleArtifacts,
    job: updatedRows?.[0] || { ...job, manifest: nextManifest }
  });
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
    queryJobsWithPublishFallback(
      env,
      `/rest/v1/jobs?select=id,price_idr,production_type,input_mode,created_at,deleted_at&${notDeletedQuery()}&order=created_at.desc&limit=500`,
      '/rest/v1/jobs?select=id,price_idr,production_type,input_mode,created_at&order=created_at.desc&limit=500'
    ),
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
    queryJobsWithPublishFallback(
      env,
      `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest,is_example_public,example_published_at,deleted_at&${notDeletedQuery()}&order=created_at.desc&limit=100`,
      '/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest&order=created_at.desc&limit=100'
    ),
    getAppSetting(env, 'example_jobs')
  ]);
  const decorated = decorateAdminJobs(jobs, users, exampleSetting?.value);
  return json({
    jobs: decorated.map(({ manifest, ...job }) => job)
  });
}

async function handleExampleJobs(env, request) {
  await requireUser(env, request);
  let profiles = [];
  let jobs = [];
  try {
    [profiles, jobs] = await Promise.all([
      supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {}),
      queryJobsWithPublishFallback(
        env,
        `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at,is_example_public,example_published_at,deleted_at&is_example_public=eq.true&status=eq.done&${notDeletedQuery()}&order=created_at.desc&limit=200`,
        null
      )
    ]);
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error)) throw error;
    return json({ exampleJobs: await listLegacyPublishedExampleJobs(env) });
  }

  const superuserIds = new Set(profiles.filter((profile) => profile.role === 'superuser').map((profile) => profile.id));
  const exampleJobs = jobs
    .filter((job) => superuserIds.has(job.user_id))
    .map((job) => toExampleFeedJob(env, job))
    .filter(Boolean);
  const legacyExampleJobs = await listLegacyPublishedExampleJobs(env);
  const mergedExampleJobs = new Map(exampleJobs.map((job) => [job.jobId, job]));
  legacyExampleJobs.forEach((job) => {
    if (!mergedExampleJobs.has(job.jobId)) {
      mergedExampleJobs.set(job.jobId, job);
    }
  });

  return json({
    exampleJobs: [...mergedExampleJobs.values()].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
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
  const [job, profiles] = await Promise.all([
    getJobByIdWithPublishFallback(
      env,
      jobId,
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,is_example_public,example_published_at,deleted_at,created_at',
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at'
    ),
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {})
  ]);

  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');
  if (job.status !== 'done') throw new Error('Hanya job selesai yang bisa dijadikan contoh.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || owner.role !== 'superuser') throw new Error('Hanya job milik superadmin yang bisa dijadikan contoh.');

  if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) {
    throw new Error('Job ini belum punya bundle contoh lengkap. Jalankan ulang job superadmin dengan fitur artefak contoh aktif.');
  }

  const artifacts = getExampleArtifactsFromManifest(job.manifest);
  const publishedAt = formatDate(new Date());
  const publishResult = await patchJobPublishState(
    env,
    job.id,
    {
      is_example_public: true,
      example_published_at: publishedAt
    },
    job
  );
  const updatedJob = publishResult.job;
  const nextExamples = await syncLegacyExampleSetting(env, updatedJob, artifacts);

  return json({
    jobId: updatedJob.id,
    productionType: updatedJob.production_type,
    isExamplePublic: true,
    examplePublishedAt: updatedJob.example_published_at,
    exampleJobs: nextExamples
  });
}

async function handleUnsetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [job, profiles] = await Promise.all([
    getJobByIdWithPublishFallback(
      env,
      jobId,
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,is_example_public,example_published_at,deleted_at,created_at',
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at'
    ),
    supabaseFetch(env, '/rest/v1/profiles?select=id,role', {})
  ]);

  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || owner.role !== 'superuser') throw new Error('Hanya job milik superadmin yang bisa dicabut dari contoh.');

  const publishResult = await patchJobPublishState(
    env,
    job.id,
    {
      is_example_public: false,
      example_published_at: null
    },
    job
  );
  await clearLegacyExampleSettingIfMatches(env, job);

  return json({
    jobId: job.id,
    isExamplePublic: false,
    job: publishResult.job
  });
}

async function handleDeleteJob(env, request, jobId) {
  const { user } = await requireUser(env, request);
  const job = await getJobByIdWithPublishFallback(
    env,
    jobId,
    'id,user_id,production_type,status,manifest,is_example_public,example_published_at,deleted_at',
    'id,user_id,production_type,status,manifest'
  );
  if (!job) throw new Error('Job tidak ditemukan.');
  if (job.user_id !== user.id) throw new Error('Hanya pemilik job yang boleh menghapus job ini.');
  const hasExampleArtifacts = Boolean(getExampleArtifactsFromManifest(job.manifest));
  if (!jobIsDeleted(job) && hasExampleArtifacts) {
    await deleteStorageObjects(env, EXAMPLE_JOBS_BUCKET, [exampleJobPrefix(job.id)]);
  }
  await clearLegacyExampleSettingIfMatches(env, job);
  if (jobIsDeleted(job)) {
    return json({ jobId: job.id, deleted: true });
  }

  const deletedAt = formatDate(new Date());
  const deleteResult = await softDeleteJobWithFallback(env, job.id, deletedAt, job);

  return json({
    jobId: job.id,
    deleted: true,
    deletedAt,
    metadataDeleted: deleteResult.usedLegacyFallback === false,
    job: deleteResult.job
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
      if (url.pathname === '/api/example-jobs' && request.method === 'GET') return await handleExampleJobs(env, request);
      const artifactsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts$/);
      if (artifactsMatch && request.method === 'POST') return await handleJobArtifactsUpload(env, request, artifactsMatch[1]);
      const deleteJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (deleteJobMatch && request.method === 'DELETE') return await handleDeleteJob(env, request, deleteJobMatch[1]);
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
      const unsetExampleMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/unset-example$/);
      if (unsetExampleMatch && request.method === 'POST') return await handleUnsetExampleJob(env, request, unsetExampleMatch[1]);
      const approveMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/approve$/);
      if (approveMatch && request.method === 'POST') return await handleApprovePayment(env, request, approveMatch[1]);
      const rejectMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/reject$/);
      if (rejectMatch && request.method === 'POST') return await handleRejectPayment(env, request, rejectMatch[1]);
      return error('Endpoint tidak ditemukan.', 404);
    } catch (err) {
      const message = err.message || 'Server error.';
      const status = message.includes('ditolak') || message.startsWith('Hanya ') ? 403 : 400;
      return error(message, status);
    }
  }
};
