import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose GLM default and Gemini fallback options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.analysisModel, 'glm-5v-turbo');
  assert.equal(presets.budget.generationModel, 'glm-image');
  assert.equal(presets.quality.generationModel, 'glm-image');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(presets.gemini_quality.provider, 'gemini_api_key_imagen3');
});

test('legacy ai_redraw_model values normalize into hybrid config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    model: 'gemini-3.1-flash-image-preview',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'gemini_api_key_imagen3');
  assert.equal(normalized.analysisModel, 'gemini-3.1-flash-preview');
  assert.equal(normalized.generationModel, 'imagen-3.0-generate-002');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
