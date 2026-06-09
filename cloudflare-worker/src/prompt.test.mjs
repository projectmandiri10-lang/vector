import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter Qwen options only', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'openrouter_qwen_image');
  assert.equal(presets.budget.analysisModel, 'qwen/qwen3-vl-235b-a22b-instruct');
  assert.equal(presets.budget.generationModel, 'qwen/qwen-image-2512');
  assert.equal(presets.quality.generationModel, 'qwen/qwen-image-2512');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy ai_redraw_model values normalize into OpenRouter Qwen config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openrouter_qwen_image');
  assert.equal(normalized.analysisModel, 'qwen/qwen3-vl-235b-a22b-instruct');
  assert.equal(normalized.generationModel, 'qwen/qwen-image-2512');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});
