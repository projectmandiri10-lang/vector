const DB_NAME = 'design-mudah-local-history';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';
const MAX_JOBS_PER_OWNER = 20;

function isIndexedDbAvailable() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('Browser ini tidak mendukung IndexedDB.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request gagal.'));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction gagal.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction dibatalkan.'));
  });
}

function serializeSeparationArtifacts(separations = []) {
  return separations.map((separation) => ({
    index: separation.index,
    kind: separation.kind || 'color',
    hex: separation.hex || '#000000',
    label: separation.label || '',
    svgBlob: separation.svgBlob || null,
    pdfBlob: separation.pdfBlob || null,
    previewBlob: separation.previewBlob || null
  }));
}

function serializeArtifacts(job = {}) {
  const artifacts = job.artifactBlobs || {};
  return {
    fullPngBlob: artifacts.fullPng || null,
    fullSvgBlob: artifacts.fullSvg || null,
    fullPdfBlob: artifacts.fullPdf || null,
    stickerCutlineSvgBlob: artifacts.stickerCutlineSvg || null,
    stickerCutlinePdfBlob: artifacts.stickerCutlinePdf || null,
    zipBlob: artifacts.zip || null,
    separationZipBlob: artifacts.separationZip || null,
    separations: serializeSeparationArtifacts(artifacts.separations)
  };
}

function makeObjectUrl(blob, objectUrls) {
  if (!(blob instanceof Blob)) return '';
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

function hydrateArtifacts(record, objectUrls) {
  const artifacts = record.artifacts || {};
  return {
    fullPng: makeObjectUrl(artifacts.fullPngBlob, objectUrls),
    fullSvg: makeObjectUrl(artifacts.fullSvgBlob, objectUrls),
    fullPdf: makeObjectUrl(artifacts.fullPdfBlob, objectUrls),
    stickerCutlineSvg: makeObjectUrl(artifacts.stickerCutlineSvgBlob, objectUrls),
    stickerCutlinePdf: makeObjectUrl(artifacts.stickerCutlinePdfBlob, objectUrls),
    zip: makeObjectUrl(artifacts.zipBlob, objectUrls),
    separationZip: makeObjectUrl(artifacts.separationZipBlob, objectUrls),
    separations: (artifacts.separations || []).map((separation) => ({
      index: separation.index,
      kind: separation.kind || 'color',
      hex: separation.hex || '#000000',
      label: separation.label || '',
      svg: makeObjectUrl(separation.svgBlob, objectUrls),
      pdf: makeObjectUrl(separation.pdfBlob, objectUrls),
      preview: makeObjectUrl(separation.previewBlob, objectUrls)
    }))
  };
}

function toStorageRecord({ ownerId, ownerEmail, sourcePreviewBlob, sourceFileName, job }) {
  return {
    id: job.jobId,
    ownerId,
    ownerEmail,
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    priceIdr: job.priceIdr || 0,
    separationFilmCount: job.separationFilmCount || 0,
    settings: job.settings || {},
    sourceFileName: sourceFileName || '',
    sourcePreviewBlob: sourcePreviewBlob || null,
    artifacts: serializeArtifacts(job)
  };
}

function sortNewestFirst(records = []) {
  return [...records].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

async function getAllRecords(database) {
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const records = await requestToPromise(store.getAll());
  await transactionToPromise(transaction);
  return Array.isArray(records) ? records : [];
}

async function trimOwnerRecords(database, ownerId) {
  const records = sortNewestFirst((await getAllRecords(database)).filter((record) => record.ownerId === ownerId));
  const staleRecords = records.slice(MAX_JOBS_PER_OWNER);
  if (staleRecords.length === 0) return;

  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  staleRecords.forEach((record) => {
    store.delete(record.id);
  });
  await transactionToPromise(transaction);
}

function hydrateRecord(record) {
  const objectUrls = [];
  return {
    id: record.id,
    sourceFileName: record.sourceFileName || '',
    sourcePreviewUrl: makeObjectUrl(record.sourcePreviewBlob, objectUrls),
    projectName: record.settings?.projectName || 'Project Vector',
    productionType: record.settings?.productionType || 'sticker',
    inputMode: record.settings?.inputMode || 'ready_trace',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    job: {
      jobId: record.jobId,
      status: record.status || 'done',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      priceIdr: record.priceIdr || 0,
      separationFilmCount: record.separationFilmCount || 0,
      settings: record.settings || {},
      files: hydrateArtifacts(record, objectUrls)
    },
    __objectUrls: objectUrls
  };
}

export async function saveHistoryJob({ ownerId, ownerEmail, sourcePreviewBlob, sourceFileName, job }) {
  if (!isIndexedDbAvailable()) return;

  const database = await openDatabase();
  try {
    const record = toStorageRecord({ ownerId, ownerEmail, sourcePreviewBlob, sourceFileName, job });
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionToPromise(transaction);
    await trimOwnerRecords(database, ownerId);
  } finally {
    database.close();
  }
}

export async function loadHistoryJobs(ownerId) {
  if (!isIndexedDbAvailable() || !ownerId) return [];

  const database = await openDatabase();
  try {
    const records = sortNewestFirst((await getAllRecords(database)).filter((record) => record.ownerId === ownerId));
    return records.map(hydrateRecord);
  } finally {
    database.close();
  }
}

export async function deleteHistoryJob(id) {
  if (!isIndexedDbAvailable() || !id) return;

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}

export function releaseHistoryJobs(records = []) {
  records.forEach((record) => {
    (record.__objectUrls || []).forEach((url) => URL.revokeObjectURL(url));
  });
}
