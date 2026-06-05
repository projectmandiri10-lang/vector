import { SUPERUSER_EMAIL } from './pricing.js';

export const EXAMPLE_JOBS_BUCKET = 'example-jobs';

const EXAMPLE_TYPES = ['sticker', 'sablon'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeExampleFiles(files) {
  const input = files && typeof files === 'object' ? files : {};
  return {
    fullPng: typeof input.fullPng === 'string' ? input.fullPng : '',
    fullSvg: typeof input.fullSvg === 'string' ? input.fullSvg : '',
    fullPdf: typeof input.fullPdf === 'string' ? input.fullPdf : '',
    stickerCutlineSvg: typeof input.stickerCutlineSvg === 'string' ? input.stickerCutlineSvg : '',
    stickerCutlinePdf: typeof input.stickerCutlinePdf === 'string' ? input.stickerCutlinePdf : '',
    zip: typeof input.zip === 'string' ? input.zip : '',
    separationZip: typeof input.separationZip === 'string' ? input.separationZip : ''
  };
}

function normalizeExampleSeparation(separation) {
  if (!separation || typeof separation !== 'object') return null;
  return {
    index: separation.index,
    kind: typeof separation.kind === 'string' ? separation.kind : 'color',
    hex: typeof separation.hex === 'string' ? separation.hex : '#000000',
    label: typeof separation.label === 'string' ? separation.label : '',
    svg: typeof separation.svg === 'string' ? separation.svg : '',
    pdf: typeof separation.pdf === 'string' ? separation.pdf : '',
    preview: typeof separation.preview === 'string' ? separation.preview : '',
    previewPng: typeof separation.previewPng === 'string' ? separation.previewPng : ''
  };
}

function normalizeExampleArtifacts(artifacts) {
  if (!artifacts || typeof artifacts !== 'object') return null;
  return {
    version: Number.isInteger(artifacts.version) ? artifacts.version : 1,
    projectName: typeof artifacts.projectName === 'string' ? artifacts.projectName : '',
    productionType: typeof artifacts.productionType === 'string' ? artifacts.productionType : '',
    inputMode: typeof artifacts.inputMode === 'string' ? artifacts.inputMode : '',
    settings: artifacts.settings && typeof artifacts.settings === 'object' ? artifacts.settings : {},
    sourcePreviewPath: typeof artifacts.sourcePreviewPath === 'string' ? artifacts.sourcePreviewPath : '',
    resultPreviewPath: typeof artifacts.resultPreviewPath === 'string' ? artifacts.resultPreviewPath : '',
    manifestPath: typeof artifacts.manifestPath === 'string' ? artifacts.manifestPath : '',
    files: normalizeExampleFiles(artifacts.files),
    separations: Array.isArray(artifacts.separations) ? artifacts.separations.map(normalizeExampleSeparation).filter(Boolean) : [],
    updatedAt: typeof artifacts.updatedAt === 'string' ? artifacts.updatedAt : ''
  };
}

function normalizeExampleEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const jobId = typeof entry.jobId === 'string' ? entry.jobId : '';
  const projectName = typeof entry.projectName === 'string' ? entry.projectName : '';
  const productionType = typeof entry.productionType === 'string' ? entry.productionType : '';
  const inputMode = typeof entry.inputMode === 'string' ? entry.inputMode : '';
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
  const sourcePreviewUrl = typeof entry.sourcePreviewUrl === 'string' ? entry.sourcePreviewUrl : '';
  const resultPreviewUrl = typeof entry.resultPreviewUrl === 'string' ? entry.resultPreviewUrl : imageUrl;
  const storagePath = typeof entry.storagePath === 'string' ? entry.storagePath : '';
  const files = normalizeExampleFiles(entry.files);
  const separations = Array.isArray(entry.separations) ? entry.separations.map(normalizeExampleSeparation).filter(Boolean) : [];
  const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : '';
  const settings = entry.settings && typeof entry.settings === 'object' ? entry.settings : {};

  if (!jobId && !imageUrl && !resultPreviewUrl && !storagePath && !files.fullPng) return null;

  return {
    jobId,
    projectName,
    productionType,
    inputMode,
    imageUrl,
    sourcePreviewUrl,
    resultPreviewUrl,
    storagePath,
    files,
    separations,
    settings,
    updatedAt
  };
}

function isPublishedExample(job = {}) {
  return job.is_example_public === true && !job.deleted_at;
}

export function isSuperuserProfile(profile, email = '') {
  return ['superuser', 'superadmin'].includes(profile?.role) || normalizeEmail(email) === SUPERUSER_EMAIL;
}

export function exampleSourcePath(jobId) {
  return `sources/${jobId}.png`;
}

export function exampleActivePath(productionType) {
  return `examples/${productionType}.png`;
}

export function getExampleArtifactsFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  if (manifest.exampleArtifacts && typeof manifest.exampleArtifacts === 'object') {
    return normalizeExampleArtifacts(manifest.exampleArtifacts);
  }
  return null;
}

export function hasCompleteExampleArtifacts(manifest, productionType = 'sticker') {
  const artifacts = getExampleArtifactsFromManifest(manifest);
  if (!artifacts) return false;

  const hasBaseFiles =
    Boolean(artifacts.sourcePreviewPath) &&
    Boolean(artifacts.resultPreviewPath) &&
    Boolean(artifacts.files.fullPng) &&
    Boolean(artifacts.files.fullSvg) &&
    Boolean(artifacts.files.fullPdf) &&
    Boolean(artifacts.files.zip);

  if (!hasBaseFiles) return false;
  if (productionType !== 'sablon') return true;
  return Boolean(artifacts.files.separationZip) && artifacts.separations.length > 0;
}

export function getExampleSourcePathFromManifest(manifest) {
  const artifacts = getExampleArtifactsFromManifest(manifest);
  if (artifacts?.sourcePreviewPath) return artifacts.sourcePreviewPath;
  if (manifest && typeof manifest === 'object' && typeof manifest.examplePreviewSourcePath === 'string') {
    return manifest.examplePreviewSourcePath;
  }
  return '';
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
    const ownerIsSuperuser = isSuperuserProfile(owner, owner.email);
    const exampleArtifacts = getExampleArtifactsFromManifest(job.manifest);
    const examplePublished = isPublishedExample(job);
    const legacyExample = currentExamples[job.production_type]?.jobId === job.id;
    return {
      ...job,
      user_email: owner.email || '',
      owner_role: owner.role || 'user',
      can_set_as_example: job.status === 'done' && ownerIsSuperuser && hasCompleteExampleArtifacts(job.manifest, job.production_type),
      can_unset_example: examplePublished || legacyExample,
      is_active_example: examplePublished || legacyExample,
      is_example_public: examplePublished,
      example_source_path: getExampleSourcePathFromManifest(job.manifest),
      has_example_artifacts: Boolean(exampleArtifacts)
    };
  });
}
