export const OPENROUTER_IMAGE_REDRAW_PROVIDER = 'openrouter_image';
export const OPENROUTER_GEMINI_REDRAW_PROVIDER = 'openrouter_gemini_image';
export const OPENROUTER_RIVERFLOW_REDRAW_PROVIDER = 'openrouter_riverflow_image';
export const HYBRID_REDRAW_PROVIDER = OPENROUTER_IMAGE_REDRAW_PROVIDER;

export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
export const DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK = 'sourceful/riverflow-v2-fast';
export const DEFAULT_OPENROUTER_SAFETY_MODEL = 'nvidia/nemotron-3.5-content-safety:free';
export const DEFAULT_OPENROUTER_PROMPT_PROFILE = 'generic_trace_clone';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
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
    estimatedUsdPerImage: 0.014,
    note: 'OpenRouter FLUX.2 Klein 1K trace-clone redraw hemat dengan safety gate Nemotron.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '1K',
    reasoningEffort: 'low',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.014,
    note: 'FLUX image-to-image memakai cleaned trace target dan prompt trace-clone ketat.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '1K',
    reasoningEffort: 'low',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.014,
    note: 'Default OpenRouter FLUX.2 Klein 1K + Nemotron safety untuk trace-clone halus siap trace.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '1K',
    reasoningEffort: 'high',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0.014,
    note: 'FLUX 1K trace-clone dengan retry kualitas, tetap lewat safety gate Nemotron.'
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

function normalizePromptProfile(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return ['generic_trace_clone', 'sourceful_trace_clone', 'gemini_trace_clone'].includes(normalized) ? normalized : fallback;
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
  const acceptsCustomModels = input.provider === OPENROUTER_IMAGE_REDRAW_PROVIDER;
  const customInput = acceptsCustomModels ? input : {};

  return {
    mode: preset.mode,
    preset: preset.mode,
    label: normalizeText(input.label, preset.label),
    provider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    analysisModel: acceptsCustomModels
      ? normalizeOptionalText(input.analysisModel, normalizeOptionalText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel))
      : normalizeOptionalText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel),
    generationModel: acceptsCustomModels
      ? normalizeText(input.generationModel || input.model, normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel))
      : normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel),
    fallbackModel: acceptsCustomModels
      ? normalizeText(input.fallbackModel, normalizeText(env.OPENROUTER_IMAGE_MODEL_FALLBACK, preset.fallbackModel))
      : normalizeText(env.OPENROUTER_IMAGE_MODEL_FALLBACK, preset.fallbackModel),
    safetyModel: acceptsCustomModels
      ? normalizeText(input.safetyModel, normalizeText(env.OPENROUTER_SAFETY_MODEL, preset.safetyModel))
      : normalizeText(env.OPENROUTER_SAFETY_MODEL, preset.safetyModel),
    promptProfile: normalizePromptProfile(customInput.promptProfile || env.OPENROUTER_PROMPT_PROFILE, preset.promptProfile),
    generationQuality: normalizeGenerationQuality(customInput.generationQuality || env.OPENROUTER_IMAGE_QUALITY, preset.generationQuality),
    imageSize: normalizeImageSize(customInput.imageSize || env.OPENROUTER_IMAGE_SIZE, preset.imageSize),
    reasoningEffort: normalizeReasoningEffort(customInput.reasoningEffort || env.OPENROUTER_REASONING_EFFORT, preset.reasoningEffort),
    backgroundMode: normalizeBackgroundMode(customInput.backgroundMode || env.OPENROUTER_BACKGROUND_MODE, preset.backgroundMode),
    safetyEnabled: normalizeBoolean(customInput.safetyEnabled ?? env.OPENROUTER_SAFETY_ENABLED, preset.safetyEnabled),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: customInput.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(customInput.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(customInput.note, preset.note)
  };
}
