import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSettings } from '../routes/jobs.routes.js';
import { buildRedrawPrompt } from '../services/aiRedraw.service.js';
import { buildSeparationSvg } from '../services/separation.service.js';
import { isNearWhite, nearestColorIndex, rgbToHex } from '../utils/colors.js';
import { buildPrintLayout, getPaperSizeMm } from '../utils/paper.js';
import { createRegistrationMarks } from '../utils/registrationMarks.js';

test('buildRedrawPrompt appends sablon and max color instructions', () => {
  const prompt = buildRedrawPrompt({
    productionType: 'sablon',
    maxColors: 4,
    aiQuality: 'ultra'
  });

  assert.match(prompt, /Redraw the uploaded image/);
  assert.match(prompt, /Optimize for manual screen printing/);
  assert.match(prompt, /approximately 4 solid colors/);
  assert.match(prompt, /extra strict shape cleanup/);
});

test('color helpers detect near white background and nearest palette', () => {
  assert.equal(rgbToHex({ r: 12, g: 128, b: 255 }), '#0C80FF');
  assert.equal(isNearWhite({ r: 247, g: 248, b: 249 }), true);
  assert.equal(isNearWhite({ r: 240, g: 248, b: 249 }), false);
  assert.equal(
    nearestColorIndex({ r: 250, g: 10, b: 10 }, [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 }
    ]),
    1
  );
});

test('registration marks creates four identical-style targets', () => {
  const marks = createRegistrationMarks({ x: 0, y: 0, width: 200, height: 100 }, 40);
  assert.equal((marks.match(/<circle/g) || []).length, 4);
  assert.equal((marks.match(/<line/g) || []).length, 8);
  assert.match(marks, /stroke="#000000"/);
});

test('separation svg contains only black artwork fill and no inactive color fill', () => {
  const svg = buildSeparationSvg({
    width: 200,
    height: 80,
    color: {
      index: 1,
      hex: '#E11D48',
      paths: ['M0 0H10V10H0Z']
    },
    settings: { actualWidthCm: 10, paperSize: 'A4', paperOrientation: 'portrait' }
  });

  assert.match(svg, /FILM 01 - #E11D48/);
  assert.match(svg, /width="210mm"/);
  assert.match(svg, /height="297mm"/);
  assert.match(svg, /viewBox="0 0 210 297"/);
  assert.match(svg, /scale\(0\.50000000\)/);
  assert.match(svg, /fill="#000000"/);
  assert.doesNotMatch(svg, /fill="#E11D48"/);
  assert.match(svg, /id="registration-marks"/);
});

test('validateSettings normalizes print sizing options', () => {
  const settings = validateSettings({
    actualWidthCm: '155',
    paperSize: 'a3',
    paperOrientation: 'landscape'
  });

  assert.equal(settings.actualWidthCm, 100);
  assert.equal(settings.paperSize, 'A3');
  assert.equal(settings.paperOrientation, 'landscape');
});

test('paper sizing converts A4/A3 orientation and rejects oversized artwork', () => {
  assert.deepEqual(getPaperSizeMm('A4', 'portrait'), { widthMm: 210, heightMm: 297 });
  assert.deepEqual(getPaperSizeMm('A3', 'landscape'), { widthMm: 420, heightMm: 297 });

  const layout = buildPrintLayout({
    sourceWidth: 200,
    sourceHeight: 100,
    actualWidthCm: 10,
    paperSize: 'A4',
    paperOrientation: 'portrait'
  });

  assert.equal(layout.artworkWidthMm, 100);
  assert.equal(layout.artworkHeightMm, 50);
  assert.equal(layout.scale, 0.5);

  assert.throws(
    () =>
      buildPrintLayout({
        sourceWidth: 200,
        sourceHeight: 100,
        actualWidthCm: 30,
        paperSize: 'A4',
        paperOrientation: 'portrait'
      }),
    /tidak muat/
  );
});
