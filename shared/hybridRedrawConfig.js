export const OPENROUTER_QWEN_REDRAW_PROVIDER = 'openrouter_qwen_image';
export const HYBRID_REDRAW_PROVIDER = OPENROUTER_QWEN_REDRAW_PROVIDER;

export const DEFAULT_OPENROUTER_ANALYSIS_MODEL = 'qwen/qwen3-vl-235b-a22b-instruct';
export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'qwen/qwen-image-2512';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: OPENROUTER_QWEN_REDRAW_PROVIDER,
    analysisModel: DEFAULT_OPENROUTER_ANALYSIS_MODEL,
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    generationQuality: 'high',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.03,
    note: 'OpenRouter Qwen VL menganalisis gambar, lalu Qwen Image menggambar ulang dengan prompt ketat dan input gambar referensi.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: OPENROUTER_QWEN_REDRAW_PROVIDER,
    analysisModel: DEFAULT_OPENROUTER_ANALYSIS_MODEL,
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    generationQuality: 'high',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.04,
    note: 'Keseimbangan biaya dan kualitas untuk logo, sticker, dan sablon lewat OpenRouter Qwen redraw.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: OPENROUTER_QWEN_REDRAW_PROVIDER,
    analysisModel: DEFAULT_OPENROUTER_ANALYSIS_MODEL,
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    generationQuality: 'high',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.05,
    note: 'Default OpenRouter Qwen VL + Qwen Image untuk redraw halus yang siap masuk trace dan pisah warna.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: OPENROUTER_QWEN_REDRAW_PROVIDER,
    analysisModel: DEFAULT_OPENROUTER_ANALYSIS_MODEL,
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    generationQuality: 'high',
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0.08,
    note: 'OpenRouter Qwen dengan satu retry otomatis saat pembacaan teks atau bentuk masih kurang yakin.'
  }
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

function normalizeGenerationQuality(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return normalized === 'low' || normalized === 'standard' || normalized === 'high' ? normalized : fallback;
}

function inferPreset(input, env) {
  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) return input.mode;
  if (typeof input.preset === 'string' && HYBRID_REDRAW_PRESETS[input.preset]) return input.preset;
  if (typeof env.AI_REDRAW_PRESET === 'string' && HYBRID_REDRAW_PRESETS[env.AI_REDRAW_PRESET]) return env.AI_REDRAW_PRESET;
  return 'quality';
}

function shouldForceQwen(input) {
  if (!input.provider) return true;
  return input.provider !== OPENROUTER_QWEN_REDRAW_PROVIDER;
}

export function listHybridRedrawPresets() {
  return Object.values(HYBRID_REDRAW_PRESETS);
}

export function normalizeHybridRedrawConfig(value = {}, env = {}) {
  const input = isObject(value) ? value : {};
  const presetKey = inferPreset(input, env);
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const forceQwen = shouldForceQwen(input);

  const analysisModel = forceQwen
    ? normalizeText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel)
    : normalizeText(input.analysisModel, normalizeText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel));
  const generationModel = forceQwen
    ? normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel)
    : normalizeText(input.generationModel || input.model, normalizeText(env.OPENROUTER_IMAGE_MODEL, preset.generationModel));

  return {
    mode: preset.mode,
    preset: preset.mode,
    label: normalizeText(input.label, preset.label),
    provider: OPENROUTER_QWEN_REDRAW_PROVIDER,
    analysisModel,
    generationModel,
    generationQuality: normalizeGenerationQuality(input.generationQuality || env.OPENROUTER_IMAGE_QUALITY, preset.generationQuality),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: input.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(input.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(input.note, preset.note)
  };
}
