export const HYBRID_REDRAW_PROVIDER = 'zai_glm5v_glm_image';
export const GEMINI_IMAGEN_REDRAW_PROVIDER = 'gemini_api_key_imagen3';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'glm-5v-turbo',
    generationModel: 'glm-image',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'economy',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.018,
    note: 'GLM-5V Turbo menganalisis niat desain, lalu GLM-Image menggambar ulang dengan biaya hemat.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'glm-5v-turbo',
    generationModel: 'glm-image',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.019,
    note: 'Keseimbangan biaya dan kualitas untuk mayoritas logo, sticker, dan sablon lewat Z.AI.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'glm-5v-turbo',
    generationModel: 'glm-image',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.02,
    note: 'Default GLM untuk redraw halus yang nanti akan di-trace dan dipisah warna.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'glm-5v-turbo',
    generationModel: 'glm-image',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0.035,
    note: 'Menambah satu retry otomatis saat GLM menilai pembacaan teks atau bentuk masih kurang yakin.'
  },
  gemini_quality: {
    mode: 'gemini_quality',
    preset: 'gemini_quality',
    label: 'Gemini fallback',
    provider: GEMINI_IMAGEN_REDRAW_PROVIDER,
    analysisModel: 'gemini-3-pro-preview',
    generationModel: 'imagen-3.0-generate-002',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.045,
    note: 'Fallback jika GLM belum sebagus Gemini untuk jenis gambar tertentu.'
  }
};

const LEGACY_MODEL_TO_PRESET = {
  'gemini-2.5-flash-image': 'budget',
  'gemini-3.1-flash-image-preview': 'gemini_quality',
  'gemini-3-pro-image-preview': 'gemini_quality'
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampEstimatedUsd(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function inferLegacyPreset(input) {
  const legacyByModel = LEGACY_MODEL_TO_PRESET[input.model];
  if (legacyByModel) {
    if (legacyByModel === 'quality' && String(input.imageSize || '').toUpperCase() === '1K') {
      return 'standard';
    }
    return legacyByModel;
  }

  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) {
    return input.mode;
  }

  return 'quality';
}

export function listHybridRedrawPresets() {
  return Object.values(HYBRID_REDRAW_PRESETS);
}

export function normalizeHybridRedrawConfig(value = {}, env = {}) {
  const input = isObject(value) ? value : {};
  const isLegacy =
    !input.provider ||
    !input.analysisModel ||
    !input.generationModel ||
    Object.prototype.hasOwnProperty.call(input, 'imageSize') ||
    Object.prototype.hasOwnProperty.call(input, 'model');

  const presetKey = isLegacy
    ? inferLegacyPreset(input)
    : normalizeText(input.preset || input.mode, normalizeText(env.AI_REDRAW_PRESET, 'quality'));
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const provider = normalizeText(input.provider, preset.provider);
  const generationCandidate =
    !isLegacy && typeof input.generationModel === 'string' && input.generationModel.trim()
      ? input.generationModel
      : !isLegacy && typeof input.model === 'string' && input.model.trim().startsWith('imagen-')
        ? input.model
        : provider === GEMINI_IMAGEN_REDRAW_PROVIDER
          ? env.IMAGEN_GENERATION_MODEL || preset.generationModel
          : env.GLM_IMAGE_MODEL || preset.generationModel;
  const analysisCandidate =
    provider === GEMINI_IMAGEN_REDRAW_PROVIDER
      ? normalizeText(env.GEMINI_ANALYSIS_MODEL, preset.analysisModel)
      : normalizeText(env.GLM_ANALYSIS_MODEL, preset.analysisModel);

  return {
    mode: preset.mode,
    preset: preset.mode,
    label: normalizeText(input.label, preset.label),
    provider,
    analysisModel: normalizeText(input.analysisModel, analysisCandidate),
    generationModel: normalizeText(generationCandidate, preset.generationModel),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: input.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(input.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(input.note, preset.note)
  };
}
