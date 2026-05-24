import fs from 'fs-extra';
import path from 'node:path';

export function storageRoot() {
  const configured = process.env.STORAGE_DIR || './storage';
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(process.env.BACKEND_DIR || process.cwd(), configured);
}

export async function ensureStorage() {
  await fs.ensureDir(path.join(storageRoot(), 'jobs'));
}

export function assertValidJobId(jobId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    const error = new Error('Job ID tidak valid.');
    error.status = 400;
    throw error;
  }
}

export function getJobDir(jobId) {
  assertValidJobId(jobId);
  return path.join(storageRoot(), 'jobs', jobId);
}

export async function ensureJobDir(jobId) {
  const jobDir = getJobDir(jobId);
  await fs.ensureDir(jobDir);
  return jobDir;
}

export function safeJobPath(jobId, ...segments) {
  const jobDir = getJobDir(jobId);
  const target = path.resolve(jobDir, ...segments);
  const relative = path.relative(jobDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Path file tidak valid.');
    error.status = 400;
    throw error;
  }
  return target;
}

export async function writeJobMeta(jobId, meta) {
  await ensureJobDir(jobId);
  await fs.writeJson(safeJobPath(jobId, 'job.json'), meta, { spaces: 2 });
}

export async function readJobMeta(jobId) {
  const metaPath = safeJobPath(jobId, 'job.json');
  if (!(await fileExists(metaPath))) return null;
  return fs.readJson(metaPath);
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupOldJobs(maxAgeHours = 48) {
  const jobsDir = path.join(storageRoot(), 'jobs');
  if (!(await fileExists(jobsDir))) return;

  const entries = await fs.readdir(jobsDir);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of entries) {
    if (!/^[0-9a-f-]{36}$/i.test(entry)) continue;
    const fullPath = path.join(jobsDir, entry);
    const stat = await fs.stat(fullPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      await fs.remove(fullPath);
    }
  }
}

export async function markInterruptedJobsFailed() {
  const jobsDir = path.join(storageRoot(), 'jobs');
  if (!(await fileExists(jobsDir))) return;

  const entries = await fs.readdir(jobsDir);
  const runningStatuses = new Set(['uploaded', 'preprocessing', 'processing_ai', 'vectorizing', 'separating_colors', 'exporting']);

  for (const entry of entries) {
    if (!/^[0-9a-f-]{36}$/i.test(entry)) continue;
    const metaPath = path.join(jobsDir, entry, 'job.json');
    if (!(await fileExists(metaPath))) continue;

    const meta = await fs.readJson(metaPath);
    if (!runningStatuses.has(meta.status)) continue;

    await fs.writeJson(
      metaPath,
      {
        ...meta,
        status: 'failed',
        progress: 100,
        message: 'Gagal memproses gambar.',
        error: 'Proses sebelumnya terhenti karena server restart. Upload ulang gambar untuk memproses kembali.',
        updatedAt: new Date().toISOString()
      },
      { spaces: 2 }
    );
  }
}
