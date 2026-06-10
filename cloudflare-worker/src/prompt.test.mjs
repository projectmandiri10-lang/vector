import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter Gemini image options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'openrouter_gemini_image');
  assert.equal(presets.budget.analysisModel, '');
  assert.equal(presets.budget.generationModel, 'google/gemini-3.1-flash-image-preview');
  assert.equal(presets.quality.generationModel, 'google/gemini-3.1-flash-image-preview');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy ai_redraw_model values normalize into OpenRouter Gemini config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'openrouter_riverflow_image',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openrouter_gemini_image');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'google/gemini-3.1-flash-image-preview');
  assert.equal(normalized.imageSize, '1K');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
