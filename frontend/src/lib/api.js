export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function isNetworkLikeError(message = '') {
  const normalized = String(message).toLowerCase();
  return normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed');
}

export function toUserApiError(error, fallbackMessage) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('VITE_API_BASE_URL')) {
    return new Error('Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.');
  }
  if (isNetworkLikeError(message)) {
    return new Error(fallbackMessage || 'Koneksi ke layanan belum tersambung. Coba lagi beberapa saat.');
  }
  return error instanceof Error ? error : new Error(fallbackMessage || 'Terjadi kendala saat menghubungi layanan.');
}

export function absoluteUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function decodeBase64UrlJson(value) {
  if (!value) return null;
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = window.atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function artifactToBlob(artifact) {
  if (!artifact?.base64) return null;
  return base64ToBlob(artifact.base64, artifact.mimeType);
}

function blobUrl(blob) {
  return blob instanceof Blob ? URL.createObjectURL(blob) : '';
}

function hydrateBackendRetouchResult(data, settings) {
  const artifacts = data.artifacts || {};
  const fullPngBlob = artifactToBlob(artifacts.fullPng);
  const fullSvgBlob = artifactToBlob(artifacts.fullSvg);
  const fullPdfBlob = artifactToBlob(artifacts.fullPdf);
  const stickerCutlineSvgBlob = artifactToBlob(artifacts.stickerCutlineSvg);
  const stickerCutlinePdfBlob = artifactToBlob(artifacts.stickerCutlinePdf);
  const zipBlob = artifactToBlob(artifacts.zip);
  const separationZipBlob = artifactToBlob(artifacts.separationZip);
  const separations = (artifacts.separations || []).map((film) => {
    const svgBlob = artifactToBlob(film.svg);
    const pdfBlob = artifactToBlob(film.pdf);
    const previewBlob = artifactToBlob(film.preview);
    return {
      index: film.index,
      kind: film.kind || 'color',
      hex: film.hex || '#000000',
      label: film.label || '',
      svg: blobUrl(svgBlob),
      pdf: blobUrl(pdfBlob),
      preview: blobUrl(previewBlob),
      svgBlob,
      pdfBlob,
      previewBlob
    };
  });

  const artifactBlobs = {
    fullPng: fullPngBlob,
    fullSvg: fullSvgBlob,
    fullPdf: fullPdfBlob,
    stickerCutlineSvg: stickerCutlineSvgBlob,
    stickerCutlinePdf: stickerCutlinePdfBlob,
    zip: zipBlob,
    separationZip: separationZipBlob,
    separations
  };

  const localResult = {
    jobId: `backend-logo-${Date.now()}`,
    status: 'done',
    progress: 100,
    message: data.message || 'Selesai diproses backend.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    localOnly: true,
    backendVectorized: true,
    separationFilmCount: data.separationFilmCount || 0,
    palette: data.palette || [],
    settings: data.settings || settings,
    files: {
      fullPng: blobUrl(fullPngBlob),
      fullSvg: blobUrl(fullSvgBlob),
      fullPdf: blobUrl(fullPdfBlob),
      stickerCutlineSvg: blobUrl(stickerCutlineSvgBlob),
      stickerCutlinePdf: blobUrl(stickerCutlinePdfBlob),
      zip: blobUrl(zipBlob),
      separationZip: blobUrl(separationZipBlob),
      separations
    },
    artifactBlobs,
    manifest: data.manifest || {}
  };

  const pngFile = fullPngBlob
    ? new File([fullPngBlob], artifacts.fullPng?.filename || 'gambar-ulang.png', { type: fullPngBlob.type || 'image/png' })
    : null;

  return { localResult, pngFile };
}

async function apiFetch(path, { accessToken, method = 'GET', body, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw toUserApiError(error, 'Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.');
  }

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

export async function uploadExampleArtifacts(jobId, formData, accessToken) {
  return apiFetch(`/api/jobs/${jobId}/artifacts`, {
    method: 'POST',
    accessToken,
    body: formData
  });
}

export async function listExampleJobs(accessToken) {
  return apiFetch('/api/example-jobs', { accessToken });
}

export async function deleteCloudJob(jobId, accessToken) {
  return apiFetch(`/api/jobs/${jobId}`, {
    method: 'DELETE',
    accessToken
  });
}

export async function requestImageRetouch(file, settings, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('settings', JSON.stringify(settings));
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/image-retouch`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData
    });
  } catch (error) {
    throw toUserApiError(error, 'Koneksi ke layanan gambar belum tersambung. Periksa URL API aplikasi.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Gambar ulang gagal.');
  }
  const retouchLedgerId = response.headers.get('x-ai-ledger-id') || '';
  const aiRedrawMetadata = decodeBase64UrlJson(response.headers.get('x-ai-redraw-metadata') || '');
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const hydrated = hydrateBackendRetouchResult(data, settings);
    return {
      file: hydrated.pngFile || file,
      retouchLedgerId: data.retouchLedgerId || retouchLedgerId,
      aiRedrawMetadata: data.aiRedrawMetadata || aiRedrawMetadata,
      localResult: hydrated.localResult
    };
  }

  const blob = await response.blob();
  return {
    file: new File([blob], 'gambar-ulang.png', { type: blob.type || 'image/png' }),
    retouchLedgerId,
    aiRedrawMetadata
  };
}

export async function requestReadyTrace(file, settings, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('settings', JSON.stringify(settings));
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/ready-trace`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData
    });
  } catch (error) {
    throw toUserApiError(error, 'Koneksi ke layanan trace belum tersambung. Periksa URL API aplikasi.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Ready Trace backend gagal.');
    error.qualityAssessment = data.qualityAssessment || null;
    error.suggestedInputMode = data.suggestedInputMode || '';
    throw error;
  }

  const data = await response.json();
  const hydrated = hydrateBackendRetouchResult(data, settings);
  return {
    file: hydrated.pngFile || file,
    localResult: hydrated.localResult,
    readyTraceMetadata: data.readyTraceMetadata || null
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

export async function createAdminUser(payload, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: {
      action: 'create',
      ...payload
    }
  });
}

export async function deleteAdminUser(userId, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: {
      action: 'delete',
      userId
    }
  });
}

export async function addAdminCredit(payload, accessToken) {
  return apiFetch('/api/admin/credits', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function getAppConfig() {
  return apiFetch('/api/app-config');
}

export async function submitContactMessage(payload) {
  return apiFetch('/api/contact', {
    method: 'POST',
    body: payload
  });
}

export async function createManualPayment(payload, accessToken) {
  return apiFetch('/api/manual-payments', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function getAdminOverview(accessToken) {
  return apiFetch('/api/admin/overview', { accessToken });
}

export async function listAdminJobs(accessToken) {
  return apiFetch('/api/admin/jobs', { accessToken });
}

export async function setAdminJobExample(jobId, accessToken) {
  return apiFetch(`/api/admin/jobs/${jobId}/set-example`, {
    method: 'POST',
    accessToken
  });
}

export async function unsetAdminJobExample(jobId, accessToken) {
  return apiFetch(`/api/admin/jobs/${jobId}/unset-example`, {
    method: 'POST',
    accessToken
  });
}

export async function listAdminManualPayments(accessToken) {
  return apiFetch('/api/admin/manual-payments', { accessToken });
}

export async function approveManualPayment(paymentId, accessToken) {
  return apiFetch(`/api/admin/manual-payments/${paymentId}/approve`, {
    method: 'POST',
    accessToken
  });
}

export async function rejectManualPayment(paymentId, payload, accessToken) {
  return apiFetch(`/api/admin/manual-payments/${paymentId}/reject`, {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listAdminPricingRules(accessToken) {
  return apiFetch('/api/admin/pricing-rules', { accessToken });
}

export async function updateAdminPricingRule(payload, accessToken) {
  return apiFetch('/api/admin/pricing-rules', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listAdminSettings(accessToken) {
  return apiFetch('/api/admin/settings', { accessToken });
}

export async function updateAdminSetting(payload, accessToken) {
  return apiFetch('/api/admin/settings', {
    method: 'POST',
    accessToken,
    body: payload
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
