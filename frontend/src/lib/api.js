export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function absoluteUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

async function apiFetch(path, { accessToken, method = 'GET', body, headers = {} } = {}) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL belum diatur. Hubungkan Cloudflare Worker API terlebih dahulu.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.blob();
  if (!response.ok) {
    throw new Error(data?.error || 'Request API gagal.');
  }
  return data;
}

export async function getBalance(accessToken) {
  return apiFetch('/api/me/balance', { accessToken });
}

export async function quoteJob(payload, accessToken) {
  return apiFetch('/api/jobs/quote', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function commitJob(payload, accessToken) {
  return apiFetch('/api/jobs/commit', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function requestAiRedraw(file, settings, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('settings', JSON.stringify(settings));
  const response = await fetch(`${API_BASE_URL}/api/ai-redraw`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'AI redraw gagal.');
  }
  const aiLedgerId = response.headers.get('x-ai-ledger-id') || '';
  const blob = await response.blob();
  return {
    file: new File([blob], 'ai-redraw.png', { type: blob.type || 'image/png' }),
    aiLedgerId
  };
}

export async function listAdminUsers(accessToken) {
  return apiFetch('/api/admin/users', { accessToken });
}

export async function updateAdminUser(payload, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function addAdminCredit(payload, accessToken) {
  return apiFetch('/api/admin/credits', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function approveManualPayment(paymentId, accessToken) {
  return apiFetch(`/api/admin/manual-payments/${paymentId}/approve`, {
    method: 'POST',
    accessToken
  });
}

export async function createJob(file, settings) {
  const formData = new FormData();
  formData.append('image', file);
  Object.entries(settings).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mengirim gambar.');
  }
  return data;
}

export async function getJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal membaca status job.');
  }
  return data;
}

export async function listJobs() {
  const response = await fetch(`${API_BASE_URL}/api/jobs`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal membaca arsip job.');
  }
  return data.jobs || [];
}

export async function deleteJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    method: 'DELETE'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus hasil.');
  }
  return data;
}
