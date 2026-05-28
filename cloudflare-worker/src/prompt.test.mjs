import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiPrompt } from './index.js';

test('buildAiPrompt emphasizes smooth outer edges and faithful colors', () => {
  const prompt = buildAiPrompt({ productionType: 'sablon' });

  assert.match(prompt, /Faithfully redraw the uploaded image/);
  assert.match(prompt, /Preserve composition, text, proportions, visible colors, and dark backgrounds/);
  assert.match(prompt, /outermost artwork edges smooth, clean, closed, continuous/);
  assert.match(prompt, /Avoid jagged outer contours, wavy borders/);
  assert.match(prompt, /spot-color screen print separation with crisp outer boundaries/);
});
