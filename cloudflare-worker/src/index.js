import { AI_REDRAW_PRICE_IDR, SUPERUSER_EMAIL, calculateJobPrice } from './pricing.js';

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
  const priceIdr = calculateJobPrice(body);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ priceIdr, balance, isUnlimited: profile.is_unlimited, canRun: profile.is_unlimited || balance >= priceIdr });
}

async function handleCommitJob(env, request) {
  const { user, profile } = await requireUser(env, request);
  const body = await readJson(request);
  const priceIdr = calculateJobPrice({
    inputMode: body.inputMode,
    separationFilmCount: body.separationFilmCount,
    aiAlreadyCharged: body.inputMode === 'ai_redraw'
  });
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
      price_idr: (body.inputMode === 'ai_redraw' ? AI_REDRAW_PRICE_IDR : 0) + priceIdr,
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
  await ensureCredit(env, profile, AI_REDRAW_PRICE_IDR);
  const form = await request.formData();
  const image = form.get('image');
  const settings = JSON.parse(form.get('settings') || '{}');
  if (!(image instanceof File)) throw new Error('File gambar wajib diisi.');

  let ledger = null;
  if (!profile.is_unlimited) {
    ledger = await insertLedger(env, {
      userId: user.id,
      amountIdr: -AI_REDRAW_PRICE_IDR,
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
  if (!response.ok) throw new Error(data?.error?.message || 'AI redraw gagal.');
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('AI tidak mengembalikan gambar.');
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
    const rows = await supabaseFetch(env, '/rest/v1/profiles?select=id,email,role,is_unlimited,is_active,deleted_at,created_at&order=created_at.desc', {});
    const users = await Promise.all(
      rows.map(async (profile) => ({
        ...profile,
        balance: profile.is_unlimited ? null : await creditBalance(env, profile.id)
      }))
    );
    return json({ users });
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
      if (url.pathname === '/api/me/balance' && request.method === 'GET') return handleBalance(env, request);
      if (url.pathname === '/api/jobs/quote' && request.method === 'POST') return handleQuote(env, request);
      if (url.pathname === '/api/jobs/commit' && request.method === 'POST') return handleCommitJob(env, request);
      if (url.pathname === '/api/ai-redraw' && request.method === 'POST') return handleAiRedraw(env, request);
      if (url.pathname === '/api/admin/users') return handleAdminUsers(env, request);
      if (url.pathname === '/api/admin/credits' && request.method === 'POST') return handleAdminCredits(env, request);
      const approveMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/approve$/);
      if (approveMatch && request.method === 'POST') return handleApprovePayment(env, request, approveMatch[1]);
      return error('Endpoint tidak ditemukan.', 404);
    } catch (err) {
      return error(err.message || 'Server error.', err.message?.includes('ditolak') ? 403 : 400);
    }
  }
};
