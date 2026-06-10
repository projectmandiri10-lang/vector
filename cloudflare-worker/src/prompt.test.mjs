import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter FLUX trace-clone options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'openrouter_image');
  assert.equal(presets.budget.analysisModel, '');
  assert.equal(presets.budget.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.budget.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(presets.budget.promptProfile, 'generic_trace_clone');
  assert.equal(presets.quality.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy ai_redraw_model values normalize into OpenRouter FLUX config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'openrouter_riverflow_image',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openrouter_image');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(normalized.promptProfile, 'generic_trace_clone');
  assert.equal(normalized.imageSize, '1K');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
