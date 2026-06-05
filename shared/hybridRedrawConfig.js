export const HYBRID_REDRAW_PROVIDER = 'vertex_hybrid_imagen3';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'gemini-3-pro-preview',
    generationModel: 'imagen-3.0-fast-generate-001',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'economy',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.022,
    note: 'Gemini menganalisis niat desain, lalu Imagen 3 Fast menggambar ulang dengan biaya paling hemat.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'gemini-3-pro-preview',
    generationModel: 'imagen-3.0-generate-002',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.041,
    note: 'Keseimbangan biaya dan kualitas untuk mayoritas logo, sticker, dan sablon.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'gemini-3-pro-preview',
    generationModel: 'imagen-3.0-generate-002',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.045,
    note: 'Default aman untuk redraw halus yang nanti akan di-trace dan dipisah warna.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: HYBRID_REDRAW_PROVIDER,
    analysisModel: 'gemini-3-pro-preview',
    generationModel: 'imagen-3.0-generate-002',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0.05,
    note: 'Menambah satu retry otomatis saat Gemini menilai pembacaan teks atau bentuk masih kurang yakin.'
  }
};

const LEGACY_MODEL_TO_PRESET = {
  'gemini-2.5-flash-image': 'budget',
  'gemini-3.1-flash-image-preview': 'quality',
  'gemini-3-pro-image-preview': 'premium'
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
  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) {
    return input.mode;
  }

  const legacyByModel = LEGACY_MODEL_TO_PRESET[input.model];
  if (legacyByModel) {
    if (legacyByModel === 'quality' && String(input.imageSize || '').toUpperCase() === '1K') {
      return 'standard';
    }
    return legacyByModel;
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

  const presetKey = normalizeText(input.preset || input.mode, isLegacy ? inferLegacyPreset(input) : 'quality');
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const generationCandidate =
    !isLegacy && typeof input.generationModel === 'string' && input.generationModel.trim()
      ? input.generationModel
      : !isLegacy && typeof input.model === 'string' && input.model.trim().startsWith('imagen-')
        ? input.model
        : env.IMAGEN_GENERATION_MODEL || preset.generationModel;

  return {
    mode: preset.mode,
    preset: preset.mode,
    label: normalizeText(input.label, preset.label),
    provider: normalizeText(input.provider, HYBRID_REDRAW_PROVIDER),
    analysisModel: normalizeText(input.analysisModel, normalizeText(env.GEMINI_ANALYSIS_MODEL, preset.analysisModel)),
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
