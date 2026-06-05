import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose hybrid Gemini + Imagen options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.analysisModel, 'gemini-3-pro-preview');
  assert.equal(presets.budget.generationModel, 'imagen-3.0-fast-generate-001');
  assert.equal(presets.quality.generationModel, 'imagen-3.0-generate-002');
  assert.equal(presets.premium.retryOnLowConfidence, true);
});

test('legacy ai_redraw_model values normalize into hybrid config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    model: 'gemini-3.1-flash-image-preview',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'gemini_api_key_imagen3');
  assert.equal(normalized.analysisModel, 'gemini-3-pro-preview');
  assert.equal(normalized.generationModel, 'imagen-3.0-generate-002');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
