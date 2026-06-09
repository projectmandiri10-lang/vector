import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter Riverflow experiment options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'openrouter_riverflow_image');
  assert.equal(presets.budget.analysisModel, '');
  assert.equal(presets.budget.generationModel, 'sourceful/riverflow-v2.5-pro:free');
  assert.equal(presets.quality.generationModel, 'sourceful/riverflow-v2.5-pro:free');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy ai_redraw_model values normalize into OpenRouter Riverflow config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openrouter_riverflow_image');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'sourceful/riverflow-v2.5-pro:free');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
