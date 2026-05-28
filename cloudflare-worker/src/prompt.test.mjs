import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiPrompt, getAiRedrawModelPresets } from './index.js';

test('buildAiPrompt emphasizes smooth outer edges and faithful colors', () => {
  const prompt = buildAiPrompt({ productionType: 'sablon' });

  assert.match(prompt, /Faithfully redraw only the actual artwork/);
  assert.match(prompt, /true redraw from shapes and colors, not pixel repair/);
  assert.match(prompt, /Separate the real design from camera background/);
  assert.match(prompt, /Do not preserve photographic background, lighting gradients/);
  assert.match(prompt, /Preserve a dark or colored background only when it is clearly an intentional bounded shape/);
  assert.match(prompt, /outermost artwork silhouette smooth, clean, closed, continuous/);
  assert.match(prompt, /Avoid jagged outer contours, wavy borders/);
  assert.match(prompt, /do not create any separate film for the photo background or lighting gradient/);
});

test('AI redraw model presets expose budget through premium options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.model, 'gemini-2.5-flash-image');
  assert.equal(presets.budget.imageSize, '1K');
  assert.equal(presets.quality.model, 'gemini-3.1-flash-image-preview');
  assert.equal(presets.quality.imageSize, '2K');
  assert.equal(presets.premium.model, 'gemini-3-pro-image-preview');
});
