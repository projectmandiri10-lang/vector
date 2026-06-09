export const OPENROUTER_RIVERFLOW_REDRAW_PROVIDER = 'openrouter_riverflow_image';
export const HYBRID_REDRAW_PROVIDER = OPENROUTER_RIVERFLOW_REDRAW_PROVIDER;

export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'sourceful/riverflow-v2.5-pro:free';
export const DEFAULT_OPENROUTER_SAFETY_MODEL = 'nvidia/nemotron-3.5-content-safety:free';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: OPENROUTER_RIVERFLOW_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    generationQuality: 'standard',
    imageSize: '1K',
    reasoningEffort: 'low',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0,
    note: 'Eksperimen Riverflow image-to-image gratis dengan safety gate Nemotron.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: OPENROUTER_RIVERFLOW_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    generationQuality: 'high',
    imageSize: '2K',
    reasoningEffort: 'medium',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0,
    note: 'Riverflow direct image-to-image memakai cleaned trace target dan prompt redraw ketat.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: OPENROUTER_RIVERFLOW_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    generationQuality: 'high',
    imageSize: '2K',
    reasoningEffort: 'medium',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0,
    note: 'Default eksperimen Riverflow V2.5 Pro image-to-image + Nemotron safety untuk redraw halus siap trace.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: OPENROUTER_RIVERFLOW_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    generationQuality: 'high',
    imageSize: '4K',
    reasoningEffort: 'high',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0,
    note: 'Riverflow dengan reasoning lebih tinggi untuk eksperimen kualitas, tetap lewat safety gate Nemotron.'
  }
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampEstimatedUsd(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeGenerationQuality(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return normalized === 'low' || normalized === 'standard' || normalized === 'high' ? normalized : fallback;
}

function normalizeImageSize(value, fallback) {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized === '1K' || normalized === '2K' || normalized === '4K' ? normalized : fallback;
}

function normalizeReasoningEffort(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return ['low', 'medium', 'high', 'xhigh'].includes(normalized) ? normalized : fallback;
}

function normalizeBackgroundMode(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return ['transparent', 'original', 'solid'].includes(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function inferPreset(input, env) {
  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) return input.mode;
  if (typeof input.preset === 'string' && HYBRID_REDRAW_PRESETS[input.preset]) return input.preset;
  if (typeof env.AI_REDRAW_PRESET === 'string' && HYBRID_REDRAW_PRESETS[env.AI_REDRAW_PRESET]) return env.AI_REDRAW_PRESET;
  return 'quality';
}

export function listHybridRedrawPresets() {
  return Object.values(HYBRID_REDRAW_PRESETS);
}

export function normalizeHybridRedrawConfig(value = {}, env = {}) {
  const input = isObject(value) ? value : {};
  const presetKey = inferPreset(input, env);
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const acceptsCustomModels = input.provider === OPENROUTER_RIVERFLOW_REDRAW_PROVIDER;

  return {
    mode: preset.mode,
    preset: preset.mode,
    label: normalizeText(input.label, preset.label),
    provider: OPENROUTER_RIVERFLOW_REDRAW_PROVIDER,
    analysisModel: acceptsCustomModels
      ? normalizeOptionalText(input.analysisModel, normalizeOptionalText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel))
      : normalizeOptionalText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel),
    generationModel: acceptsCustomModels
      ? normalizeText(input.generationModel || input.model, normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel))
      : normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel),
    safetyModel: acceptsCustomModels
      ? normalizeText(input.safetyModel, normalizeText(env.OPENROUTER_SAFETY_MODEL, preset.safetyModel))
      : normalizeText(env.OPENROUTER_SAFETY_MODEL, preset.safetyModel),
    generationQuality: normalizeGenerationQuality(input.generationQuality || env.OPENROUTER_IMAGE_QUALITY, preset.generationQuality),
    imageSize: normalizeImageSize(input.imageSize || env.OPENROUTER_IMAGE_SIZE, preset.imageSize),
    reasoningEffort: normalizeReasoningEffort(input.reasoningEffort || env.OPENROUTER_REASONING_EFFORT, preset.reasoningEffort),
    backgroundMode: normalizeBackgroundMode(input.backgroundMode || env.OPENROUTER_BACKGROUND_MODE, preset.backgroundMode),
    safetyEnabled: normalizeBoolean(input.safetyEnabled ?? env.OPENROUTER_SAFETY_ENABLED, preset.safetyEnabled),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: input.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(input.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(input.note, preset.note)
  };
}
