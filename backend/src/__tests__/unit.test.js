import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { PNG } from 'pngjs';
import { validateSettings } from '../routes/jobs.routes.js';
import { buildRedrawPrompt } from '../services/aiRedraw.service.js';
import { createMasksForPalette, quantizeImage } from '../services/quantize.service.js';
import { buildSeparationSvg, createFilmPlan, createSeparations } from '../services/separation.service.js';
import { createStickerCutline } from '../services/stickerCutline.service.js';
import { isLowChroma, isNearWhite, nearestColorIndex, rgbToHex } from '../utils/colors.js';
import { buildPrintLayout, getPaperSizeMm } from '../utils/paper.js';
import { createRegistrationMarks } from '../utils/registrationMarks.js';

function activeMaskPixelCount(png) {
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] >= 16 && png.data[i] < 128 && png.data[i + 1] < 128 && png.data[i + 2] < 128) {
      count += 1;
    }
  }
  return count;
}

test('buildRedrawPrompt appends sablon and max color instructions', () => {
  const prompt = buildRedrawPrompt({
    productionType: 'sablon',
    maxColors: 4,
    aiQuality: 'standard',
    whiteAsBackground: false
  });

  assert.match(prompt, /Faithfully redraw the uploaded image/);
  assert.match(prompt, /Preserve all important visible colors/);
  assert.match(prompt, /Do not change a dark background to white/);
  assert.match(prompt, /Treat white as a real printable artwork color/);
  assert.match(prompt, /Optimize for manual screen printing/);
  assert.match(prompt, /approximately 4 solid colors as a target/);
});

test('standard prompt prioritizes faithful color matching', () => {
  const prompt = buildRedrawPrompt({
    productionType: 'sablon',
    maxColors: 4,
    aiQuality: 'standard',
    whiteAsBackground: true
  });

  assert.match(prompt, /prioritize accurate color matching/);
  assert.match(prompt, /Preserve any non-white background color/);
});

test('color helpers detect near white background and nearest palette', () => {
  assert.equal(rgbToHex({ r: 12, g: 128, b: 255 }), '#0C80FF');
  assert.equal(isLowChroma({ r: 145, g: 145, b: 145 }), true);
  assert.equal(isLowChroma({ r: 218, g: 59, b: 82 }), false);
  assert.equal(isNearWhite({ r: 247, g: 248, b: 249 }), true);
  assert.equal(isNearWhite({ r: 240, g: 248, b: 249 }), false);
  assert.equal(
    nearestColorIndex({ r: 250, g: 10, b: 10 }, [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 }
    ]),
    1
  );
  assert.equal(
    nearestColorIndex({ r: 145, g: 145, b: 145 }, [
      { r: 1, g: 1, b: 1 },
      { r: 253, g: 253, b: 253 },
      { r: 9, g: 150, b: 98 },
      { r: 218, g: 59, b: 82 }
    ]),
    1
  );
  assert.equal(
    nearestColorIndex({ r: 218, g: 59, b: 82 }, [
      { r: 1, g: 1, b: 1 },
      { r: 253, g: 253, b: 253 },
      { r: 9, g: 150, b: 98 },
      { r: 218, g: 59, b: 82 }
    ]),
    3
  );
});

test('createMasksForPalette removes tiny color specks and keeps real color regions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-mask-test-'));
  try {
    const sourcePath = path.join(tempDir, 'source.png');
    const maskDir = path.join(tempDir, 'masks');
    const png = new PNG({ width: 24, height: 24, colorType: 6 });

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      }
    }

    for (let y = 8; y < 16; y += 1) {
      for (let x = 8; x < 16; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 218;
        png.data[idx + 1] = 59;
        png.data[idx + 2] = 82;
      }
    }

    const speckIdx = (png.width * 2 + 2) << 2;
    png.data[speckIdx] = 218;
    png.data[speckIdx + 1] = 59;
    png.data[speckIdx + 2] = 82;

    await fs.writeFile(sourcePath, PNG.sync.write(png));
    await createMasksForPalette(
      sourcePath,
      [
        { index: 1, hex: '#010101', r: 1, g: 1, b: 1 },
        { index: 2, hex: '#FDFDFD', r: 253, g: 253, b: 253 },
        { index: 3, hex: '#DA3B52', r: 218, g: 59, b: 82 }
      ],
      maskDir,
      { whiteAsBackground: false }
    );

    const redMask = PNG.sync.read(await fs.readFile(path.join(maskDir, 'color-03.png')));
    assert.equal(activeMaskPixelCount(redMask), 64);
  } finally {
    await fs.remove(tempDir);
  }
});

test('quantizeImage defaults to automatic colors and manual mode limits palette size', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-quantize-test-'));
  try {
    const sourcePath = path.join(tempDir, 'source.png');
    const png = new PNG({ width: 50, height: 10, colorType: 6 });
    const colors = [
      [0, 0, 0],
      [230, 40, 80],
      [0, 160, 90],
      [40, 80, 230],
      [240, 210, 40]
    ];

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const [r, g, b] = colors[Math.floor(x / 10)];
        const idx = (png.width * y + x) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }

    await fs.writeFile(sourcePath, PNG.sync.write(png));

    const automatic = await quantizeImage(sourcePath, { colorLimitMode: 'auto', whiteAsBackground: false });
    const manual = await quantizeImage(sourcePath, { colorLimitMode: 'manual', maxColors: 3, whiteAsBackground: false });

    assert.equal(automatic.palette.length, 5);
    assert.equal(manual.palette.length, 3);
  } finally {
    await fs.remove(tempDir);
  }
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

test('film plan excludes full canvas background by default and keeps legacy layout when requested', () => {
  const pathsByColor = [
    {
      index: 1,
      hex: '#000000',
      paths: ['M0 0 L200 0 L200 100 L0 100 Z']
    },
    {
      index: 2,
      hex: '#FFFFFF',
      paths: ['M50 20 L150 20 L150 80 L50 80 Z']
    },
    {
      index: 3,
      hex: '#E41E4D',
      paths: ['M120 40 L160 40 L160 90 L120 90 Z']
    }
  ];

  const cropped = createFilmPlan({ pathsByColor, width: 200, height: 100, settings: {} });
  assert.equal(cropped.backgroundColor.index, 1);
  assert.deepEqual(
    cropped.colors.map((color) => color.index),
    [2, 3]
  );
  assert.deepEqual(
    {
      x: cropped.bounds.x,
      y: cropped.bounds.y,
      width: cropped.bounds.width,
      height: cropped.bounds.height
    },
    { x: 50, y: 20, width: 110, height: 70 }
  );

  const fullCanvas = createFilmPlan({
    pathsByColor,
    width: 200,
    height: 100,
    settings: { includeBackgroundInFilmSize: true }
  });
  assert.equal(fullCanvas.backgroundColor, null);
  assert.deepEqual(
    fullCanvas.colors.map((color) => color.index),
    [1, 2, 3]
  );
  assert.deepEqual(
    {
      x: fullCanvas.bounds.x,
      y: fullCanvas.bounds.y,
      width: fullCanvas.bounds.width,
      height: fullCanvas.bounds.height
    },
    { x: 0, y: 0, width: 200, height: 100 }
  );
});

test('createSeparations can add an underbase film aligned to cropped artwork', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-underbase-test-'));
  try {
    const separations = await createSeparations({
      outputDir: tempDir,
      width: 200,
      height: 100,
      pathsByColor: [
        {
          index: 1,
          hex: '#000000',
          paths: ['M0 0 L200 0 L200 100 L0 100 Z']
        },
        {
          index: 2,
          hex: '#FFFFFF',
          paths: ['M50 20 L150 20 L150 80 L50 80 Z']
        }
      ],
      settings: {
        actualWidthCm: 10,
        paperSize: 'A4',
        paperOrientation: 'portrait',
        createUnderbaseFilm: true
      }
    });

    assert.equal(separations[0].kind, 'underbase');
    assert.equal(separations[0].label, 'FILM DASAR - HITAM 100%');
    const svg = await fs.readFile(path.join(tempDir, 'film-underbase.svg'), 'utf8');
    assert.match(svg, /FILM DASAR - HITAM 100%/);
    assert.match(svg, /translate\(-50\.000 -20\.000\)/);
  } finally {
    await fs.remove(tempDir);
  }
});

test('createStickerCutline traces a non-background silhouette with millimeter offset', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-cutline-test-'));
  try {
    const maskPath = path.join(tempDir, 'color-01.png');
    const png = new PNG({ width: 40, height: 20, colorType: 6 });
    png.data.fill(255);
    for (let y = 5; y < 15; y += 1) {
      for (let x = 5; x < 35; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }
    await fs.writeFile(maskPath, PNG.sync.write(png));

    const result = await createStickerCutline({
      outputDir: tempDir,
      width: 40,
      height: 20,
      masks: [{ index: 1, filePath: maskPath }],
      pathsByColor: [
        {
          index: 1,
          hex: '#FFFFFF',
          paths: ['M0 0 L40 0 L40 20 L0 20 Z']
        }
      ],
      settings: {
        productionType: 'sticker',
        stickerCutlineEnabled: true,
        stickerCutlineOffsetMm: 2,
        actualWidthCm: 4,
        paperSize: 'A4',
        paperOrientation: 'portrait'
      }
    });

    assert.equal(result.radiusPx, 2);
    const svg = await fs.readFile(path.join(tempDir, 'sticker-cutline.svg'), 'utf8');
    assert.match(svg, /id="CutContour"/);
    assert.match(svg, /stroke="#FF00FF"/);
    assert.match(svg, /Sticker cutline 2 mm/);
  } finally {
    await fs.remove(tempDir);
  }
});

test('separation svg crops layout to artwork bounds', () => {
  const svg = buildSeparationSvg({
    width: 200,
    height: 100,
    bounds: { x: 50, y: 20, width: 100, height: 50, maxX: 150, maxY: 70 },
    color: {
      index: 2,
      hex: '#FFFFFF',
      paths: ['M50 20 L150 20 L150 70 L50 70 Z']
    },
    settings: { actualWidthCm: 10, paperSize: 'A4', paperOrientation: 'portrait' }
  });

  assert.match(svg, /scale\(1\.00000000\) translate\(-50\.000 -20\.000\)/);
  assert.match(svg, /FILM 02 - #FFFFFF/);
});

test('validateSettings normalizes print sizing options', () => {
  const settings = validateSettings({
    actualWidthCm: '155',
    paperSize: 'a3',
    paperOrientation: 'landscape',
    aiQuality: 'legacy-high'
  });

  assert.equal(settings.actualWidthCm, 100);
  assert.equal(settings.paperSize, 'A3');
  assert.equal(settings.paperOrientation, 'landscape');
  assert.equal(settings.aiQuality, 'standard');
  assert.equal(settings.includeBackgroundInFilmSize, false);
  assert.equal(settings.inputMode, 'ai_redraw');
  assert.equal(settings.colorLimitMode, 'auto');
  assert.equal(settings.stickerCutlineEnabled, true);
  assert.equal(settings.stickerCutlineOffsetMm, 2);
  assert.equal(settings.createUnderbaseFilm, false);

  const includeBackground = validateSettings({ includeBackgroundInFilmSize: 'true' });
  assert.equal(includeBackground.includeBackgroundInFilmSize, true);

  const readyTrace = validateSettings({
    inputMode: 'ready_trace',
    colorLimitMode: 'manual',
    maxColors: '3',
    stickerCutlineOffsetMm: '1.5'
  });
  assert.equal(readyTrace.inputMode, 'ready_trace');
  assert.equal(readyTrace.colorLimitMode, 'manual');
  assert.equal(readyTrace.maxColors, 3);
  assert.equal(readyTrace.stickerCutlineOffsetMm, 1.5);

  const sablon = validateSettings({ productionType: 'sablon' });
  assert.equal(sablon.createUnderbaseFilm, true);
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
