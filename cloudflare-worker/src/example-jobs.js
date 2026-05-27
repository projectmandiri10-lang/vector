import { SUPERUSER_EMAIL } from './pricing.js';

export const EXAMPLE_JOBS_BUCKET = 'example-jobs';

const EXAMPLE_TYPES = ['sticker', 'sablon'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeExampleEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const jobId = typeof entry.jobId === 'string' ? entry.jobId : '';
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
  const storagePath = typeof entry.storagePath === 'string' ? entry.storagePath : '';
  const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : '';
  if (!jobId && !imageUrl && !storagePath) return null;
  return { jobId, imageUrl, storagePath, updatedAt };
}

export function isSuperuserProfile(profile, email = '') {
  return profile?.role === 'superuser' || normalizeEmail(email) === SUPERUSER_EMAIL;
}

export function exampleSourcePath(jobId) {
  return `sources/${jobId}.png`;
}

export function exampleActivePath(productionType) {
  return `examples/${productionType}.png`;
}

export function getExampleSourcePathFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return '';
  return typeof manifest.examplePreviewSourcePath === 'string' ? manifest.examplePreviewSourcePath : '';
}

export function normalizeExampleJobsSetting(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(EXAMPLE_TYPES.map((type) => [type, normalizeExampleEntry(input[type])]));
}

export function updateExampleJobsSetting(currentValue, productionType, entry) {
  const next = normalizeExampleJobsSetting(currentValue);
  next[productionType] = normalizeExampleEntry(entry);
  return next;
}

export function decorateAdminJobs(jobs, profiles, exampleJobsValue) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const currentExamples = normalizeExampleJobsSetting(exampleJobsValue);
  return jobs.map((job) => {
    const owner = profilesById.get(job.user_id) || {};
    const exampleSource = getExampleSourcePathFromManifest(job.manifest);
    return {
      ...job,
      user_email: owner.email || '',
      owner_role: owner.role || 'user',
      can_set_as_example: job.status === 'done' && owner.role === 'superuser' && Boolean(exampleSource),
      is_active_example: currentExamples[job.production_type]?.jobId === job.id,
      example_source_path: exampleSource
    };
  });
}
