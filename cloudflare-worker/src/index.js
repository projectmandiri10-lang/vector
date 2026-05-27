import { AI_REDRAW_PRICE_IDR, SUPERUSER_EMAIL } from './pricing.js';

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
  const baseUrl = (env.LITELLM_BASE_URL || '').replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${baseUrl}/v1/images/edits`;
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

function handleHealth() {
  return json({
    ok: true,
    service: 'design-mudah',
    message: 'Worker API aktif. Gunakan endpoint /api/... dari aplikasi frontend.',
    endpoints: [
      'GET /api/me/balance',
      'POST /api/jobs/quote',
      'POST /api/jobs/commit',
      'POST /api/image-retouch'
    ]
  });
}

async function supabaseFetch(env, path, { method = 'GET', token, body, prefer } = {}) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`,
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

async function listProfilesWithBalance(env) {
  const rows = await supabaseFetch(env, '/rest/v1/profiles?select=id,email,role,is_unlimited,is_active,deleted_at,created_at&order=created_at.desc', {});
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

async function getUser(env, request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Login dibutuhkan.');
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,is_unlimited,is_active`,
    {}
  );
  const profile = rows?.[0];
  if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
  return profile;
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
  const job = jobRows?.[0];

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

  const aiForm = new FormData();
  aiForm.append('image', image, image.name || 'input.png');
  aiForm.append('prompt', buildAiPrompt(settings));
  aiForm.append('model', env.AI_IMAGE_MODEL || 'gpt-image-2');
  aiForm.append('size', '1024x1024');

  const response = await fetch(litellmImagesUrl(env), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LITELLM_SECRET_KEY}`
    },
    body: aiForm
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Gambar ulang gagal.');
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Layanan gambar ulang tidak mengembalikan gambar.');
  const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/png',
      'X-AI-Ledger-Id': ledger?.id || ''
    }
  });
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
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    return json({ users: await listProfilesWithBalance(env) });
  }

  const body = await readJson(request);
  const allowed = {};
  for (const key of ['role', 'is_unlimited', 'is_active', 'deleted_at']) {
    if (Object.prototype.hasOwnProperty.call(body.patch || {}, key)) allowed[key] = body.patch[key];
  }
  const rows = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(body.userId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: allowed
  });
  return json({ user: rows?.[0] });
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
  const users = await supabaseFetch(env, '/rest/v1/profiles?select=id,email', {});
  const jobs = await supabaseFetch(env, '/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at&order=created_at.desc&limit=100', {});
  return json({ jobs: withUserEmails(jobs, users) });
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
      if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return handleHealth();
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
