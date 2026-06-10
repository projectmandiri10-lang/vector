import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { PNG } from 'pngjs';
import { validateSettings } from '../routes/jobs.routes.js';
import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';
import {
  buildOpenRouterImageGenerationRequest,
  buildOpenRouterSafetyRequest,
  buildRedrawPrompt,
  extractOpenRouterImageReference,
  parseOpenRouterSafetyResult
} from '../services/aiRedraw.service.js';
import { createLogoRestoreArtifacts, logoRestoreBuffer } from '../services/logoRestore.service.js';
import { assessImageQuality } from '../services/imageQuality.service.js';
import { createMasksForPalette, quantizeImage } from '../services/quantize.service.js';
import { buildSeparationSvg, createFilmPlan, createSeparations } from '../services/separation.service.js';
import { createStickerCutline } from '../services/stickerCutline.service.js';
import { refineTraceSourceImage } from '../services/traceRefinement.service.js';
import { canonicalizeSpotPixel, colorDistance, isLowChroma, isNearWhite, nearestColorIndex, rgbToHex } from '../utils/colors.js';
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

function makeFlatLogoBuffer() {
  const png = new PNG({ width: 180, height: 120, colorType: 6 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 8;
      png.data[idx + 1] = 8;
      png.data[idx + 2] = 10;
      png.data[idx + 3] = 255;
    }
  }

  for (let y = 28; y < 54; y += 1) {
    for (let x = 48; x < 145; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 245;
      png.data[idx + 1] = 245;
      png.data[idx + 2] = 245;
      png.data[idx + 3] = 255;
    }
  }

  for (let y = 68; y < 96; y += 1) {
    for (let x = 24; x < 122; x += 1) {
      if (x < 48 && y < 82) continue;
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 236;
      png.data[idx + 1] = 200;
      png.data[idx + 2] = 12;
      png.data[idx + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

function makeHaloLogoBuffer() {
  const png = new PNG({ width: 220, height: 140, colorType: 6 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 8;
      png.data[idx + 1] = 8;
      png.data[idx + 2] = 10;
      png.data[idx + 3] = 255;
    }
  }

  for (let y = 40; y < 96; y += 1) {
    for (let x = 26; x < 174; x += 1) {
      const edge = x < 34 || x >= 166 || y < 48 || y >= 88;
      const idx = (png.width * y + x) << 2;
      if (edge) {
        png.data[idx] = 122;
        png.data[idx + 1] = 102;
        png.data[idx + 2] = 40;
      } else {
        png.data[idx] = 252;
        png.data[idx + 1] = 215;
        png.data[idx + 2] = 1;
      }
      png.data[idx + 3] = 255;
    }
  }

  for (let y = 18; y < 34; y += 1) {
    for (let x = 50; x < 168; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 236;
      png.data[idx + 1] = 236;
      png.data[idx + 2] = 236;
      png.data[idx + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

test('buildRedrawPrompt appends sablon and max color instructions', () => {
  const prompt = buildRedrawPrompt({
    productionType: 'sablon',
    maxColors: 4,
    aiQuality: 'standard',
    colorLimitMode: 'manual',
    whiteAsBackground: false
  });

  assert.match(prompt, /Faithfully redraw the uploaded artwork/);
  assert.match(prompt, /true redraw from shape intent and color placement/);
  assert.match(prompt, /Treat white inside the actual artwork as a printable color/);
  assert.match(prompt, /Optimize for manual screen printing and backend vector tracing/);
  assert.match(prompt, /Keep the redraw within about 4 dominant printable solid colors/);
  assert.match(prompt, /outermost artwork silhouette as smooth, clean, closed, continuous/);
  assert.match(prompt, /Preserve exact readable text/);
  assert.match(prompt, /not OCR reconstruction, not scan cleanup, not sharpening, not upscaling/);
  assert.match(prompt, /no scan artifacts/);
});

test('standard prompt prioritizes faithful color matching', () => {
  const prompt = buildRedrawPrompt({
    productionType: 'sablon',
    maxColors: 4,
    aiQuality: 'standard',
    colorLimitMode: 'auto',
    whiteAsBackground: true
  });

  assert.match(prompt, /Remove all camera background/);
  assert.match(prompt, /Treat white, near-white, and paper-like empty background as non-printing space/);
  assert.match(prompt, /no jagged steps, no broken edges, and no accidental gaps/);
});

test('OpenRouter config defaults to FLUX trace-clone generator and Nemotron safety', () => {
  const config = normalizeHybridRedrawConfig({}, {});

  assert.equal(config.provider, 'openrouter_image');
  assert.equal(config.analysisModel, '');
  assert.equal(config.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(config.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(config.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(config.promptProfile, 'generic_trace_clone');
  assert.equal(config.generationQuality, 'high');
  assert.equal(config.imageSize, '1K');
  assert.equal(config.reasoningEffort, 'low');
  assert.equal(config.backgroundMode, 'transparent');
  assert.equal(config.safetyEnabled, true);
});

test('OpenRouter config accepts env overrides', () => {
  const config = normalizeHybridRedrawConfig(
    {},
    {
      OPENROUTER_IMAGE_MODEL: 'custom/image-model',
      OPENROUTER_IMAGE_MODEL_FALLBACK: 'custom/fallback-model',
      OPENROUTER_SAFETY_MODEL: 'custom/safety-model',
      OPENROUTER_PROMPT_PROFILE: 'sourceful_trace_clone',
      OPENROUTER_IMAGE_SIZE: '4K',
      OPENROUTER_REASONING_EFFORT: 'high',
      OPENROUTER_BACKGROUND_MODE: 'solid',
      OPENROUTER_SAFETY_ENABLED: '0'
    }
  );

  assert.equal(config.provider, 'openrouter_image');
  assert.equal(config.generationModel, 'custom/image-model');
  assert.equal(config.fallbackModel, 'custom/fallback-model');
  assert.equal(config.safetyModel, 'custom/safety-model');
  assert.equal(config.promptProfile, 'sourceful_trace_clone');
  assert.equal(config.imageSize, '4K');
  assert.equal(config.reasoningEffort, 'high');
  assert.equal(config.backgroundMode, 'solid');
  assert.equal(config.safetyEnabled, false);
});

test('OpenRouter safety request sends normalized original and cleaned trace target images', () => {
  const request = buildOpenRouterSafetyRequest(
    {
      normalizedBuffer: Buffer.from('original'),
      analysisBuffer: Buffer.from('cleaned'),
      preprocess: 'node_heuristic'
    },
    { productionType: 'sablon' },
    { safetyModel: 'nvidia/nemotron-3.5-content-safety:free' }
  );

  const userContent = request.messages[1].content;
  const imageInputs = userContent.filter((part) => part.type === 'image_url');
  assert.equal(request.model, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(imageInputs.length, 2);
  assert.match(imageInputs[0].image_url.url, /^data:image\/png;base64,/);
  assert.match(imageInputs[1].image_url.url, /^data:image\/png;base64,/);
  assert.match(userContent.map((part) => part.text || '').join(' '), /normalized original upload/);
  assert.match(userContent.map((part) => part.text || '').join(' '), /cleaned trace target/);
});

test('FLUX image generation request sends image-only modality and strict trace-clone instructions', () => {
  const request = buildOpenRouterImageGenerationRequest(
    'Strict vector redraw prompt.',
    {
      generationModel: 'black-forest-labs/flux.2-klein-4b',
      generationQuality: 'high',
      resolutionPolicy: 'high',
      imageSize: '1K',
      reasoningEffort: 'low',
      backgroundMode: 'transparent',
      promptProfile: 'generic_trace_clone'
    },
    { analysisBuffer: Buffer.from('cleaned') }
  );

  const content = request.messages[0].content;
  const promptText = content.find((part) => part.type === 'text').text;
  assert.equal(request.model, 'black-forest-labs/flux.2-klein-4b');
  assert.deepEqual(request.modalities, ['image']);
  assert.equal(request.image_config.image_size, '1K');
  assert.equal(request.image_config.background_mode, undefined);
  assert.equal(request.image_config.scoring_prompt, undefined);
  assert.equal(request.image_config.scoring_rubric, undefined);
  assert.equal(request.reasoning, undefined);
  assert.equal(content.filter((part) => part.type === 'image_url').length, 1);
  assert.match(promptText, /Use the provided image as the only visual reference/);
  assert.match(promptText, /Treat every letter as a graphic shape, not OCR text/);
  assert.match(promptText, /Do not invent, redesign, beautify/);
  assert.match(promptText, /Remove photo, camera, paper, fabric/);
  assert.match(promptText, /pixel blocks, halftone dots/);
  assert.match(promptText, /Rebuild smooth closed outer contours/);
  assert.match(promptText, /transparent background/);
});

test('Sourceful fallback request keeps scoring fields and reasoning', () => {
  const request = buildOpenRouterImageGenerationRequest(
    'Strict vector redraw prompt.',
    {
      generationModel: 'sourceful/riverflow-v2-fast',
      imageSize: '1K',
      reasoningEffort: 'low',
      backgroundMode: 'transparent',
      promptProfile: 'generic_trace_clone'
    },
    { analysisBuffer: Buffer.from('cleaned') }
  );

  assert.deepEqual(request.modalities, ['image']);
  assert.equal(request.image_config.background_mode, 'transparent');
  assert.match(request.image_config.scoring_prompt, /Score high/);
  assert.match(request.image_config.scoring_rubric, /manual-vector-like/);
  assert.deepEqual(request.reasoning, { effort: 'low' });
});

test('Nemotron safety parser blocks unsafe results and accepts safe results', () => {
  assert.equal(parseOpenRouterSafetyResult('{"safe":true,"reason":"ordinary logo"}').safe, true);
  assert.equal(parseOpenRouterSafetyResult('{"safe":false,"reason":"graphic violence"}').safe, false);
  assert.equal(parseOpenRouterSafetyResult('Allowed. No unsafe content detected.').safe, true);
});

test('OpenRouter image response parser accepts data URLs and remote URLs', () => {
  const dataUrl = 'data:image/png;base64,AAA=';
  const remoteUrl = 'https://example.com/redraw.png';

  assert.equal(
    extractOpenRouterImageReference({
      choices: [{ message: { images: [{ type: 'image_url', image_url: { url: dataUrl } }] } }]
    }),
    dataUrl
  );
  assert.equal(
    extractOpenRouterImageReference({
      choices: [{ message: { content: [{ type: 'image_url', image_url: { url: remoteUrl } }] } }]
    }),
    remoteUrl
  );
});

test('logoRestoreBuffer preserves flat logo colors without generative redraw', async () => {
  const result = await logoRestoreBuffer(makeFlatLogoBuffer(), {
    productionType: 'sablon',
    removeBackground: true,
    separateColors: true
  });

  assert.equal(result.canRestore, true);
  assert.equal(result.metadata.provider, 'logo_restore_trace_first');
  assert.ok(result.metadata.palette.some((color) => color.hex === '#FFFFFF'));
  assert.ok(result.metadata.palette.some((color) => color.hex === '#FFDA00'));

  const output = PNG.sync.read(result.imageBuffer);
  let transparentPixels = 0;
  let whitePixels = 0;
  let yellowPixels = 0;
  for (let i = 0; i < output.data.length; i += 4) {
    const alpha = output.data[i + 3];
    if (alpha < 16) transparentPixels += 1;
    if (alpha >= 250 && output.data[i] >= 245 && output.data[i + 1] >= 245 && output.data[i + 2] >= 245) whitePixels += 1;
    if (alpha >= 250 && output.data[i] >= 245 && output.data[i + 1] >= 190 && output.data[i + 2] <= 40) yellowPixels += 1;
  }

  assert.ok(transparentPixels > 0);
  assert.ok(whitePixels > 0);
  assert.ok(yellowPixels > 0);
});

test('ready trace quality assessment blocks very low resolution input', async () => {
  const png = new PNG({ width: 144, height: 191, colorType: 6 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 18;
    png.data[i + 1] = 18;
    png.data[i + 2] = 18;
    png.data[i + 3] = 255;
  }
  const assessment = await assessImageQuality(PNG.sync.write(png), { forMode: 'ready_trace' });
  assert.equal(assessment.qualityStatus, 'blocked');
  assert.equal(assessment.recommendedMode, 'ai_redraw');
  assert.match(assessment.reasons.join(' '), /Resolusi terlalu kecil/);
});

test('logoRestoreBuffer skips deterministic restore when quality assessment is blocked', async () => {
  const qualityAssessment = {
    qualityStatus: 'blocked',
    noiseScore: 12,
    reasons: ['Resolusi terlalu kecil']
  };
  const result = await logoRestoreBuffer(makeFlatLogoBuffer(), { productionType: 'sablon' }, { qualityAssessment });
  assert.equal(result.canRestore, false);
  assert.equal(result.metadata.reason, 'quality_blocked');
});

test('createLogoRestoreArtifacts returns backend vector artifacts for logo restore', async () => {
  const restore = await logoRestoreBuffer(makeFlatLogoBuffer(), {
    productionType: 'sablon',
    removeBackground: true,
    separateColors: false,
    stickerCutlineEnabled: false
  });

  const result = await createLogoRestoreArtifacts({
    imageBuffer: restore.imageBuffer,
    settings: {
      productionType: 'sablon',
      removeBackground: true,
      separateColors: false,
      stickerCutlineEnabled: false
    },
    metadata: restore.metadata
  });

  assert.equal(result.mode, 'logo_restore_artifacts');
  assert.equal(result.status, 'done');
  assert.ok(result.artifacts.fullPng.base64.length > 100);
  assert.ok(result.artifacts.fullSvg.base64.length > 100);
  assert.ok(result.artifacts.fullPdf.base64.length > 100);
  assert.ok(result.artifacts.zip.base64.length > 100);
  assert.match(Buffer.from(result.artifacts.fullSvg.base64, 'base64').toString('utf8'), /<path/);
  assert.equal(result.manifest.aiRedraw.artifactsGenerated, true);
});

test('logoRestore strict spots merge dark yellow halo into printable yellow', async () => {
  const restore = await logoRestoreBuffer(makeHaloLogoBuffer(), {
    productionType: 'sablon',
    removeBackground: true,
    separateColors: true
  });

  assert.equal(restore.canRestore, true);
  assert.equal(restore.metadata.strictSpotColors, true);
  assert.ok(restore.metadata.palette.some((color) => color.hex === '#FFDA00'));
  assert.ok(!restore.metadata.palette.some((color) => color.hex === '#7A6628'));

  const output = PNG.sync.read(restore.imageBuffer);
  let darkHaloPixels = 0;
  for (let i = 0; i < output.data.length; i += 4) {
    if (output.data[i + 3] < 16) continue;
    const pixel = { r: output.data[i], g: output.data[i + 1], b: output.data[i + 2] };
    if (colorDistance(pixel, { r: 122, g: 102, b: 40 }) <= 5) darkHaloPixels += 1;
  }
  assert.equal(darkHaloPixels, 0);

  const artifacts = await createLogoRestoreArtifacts({
    imageBuffer: restore.imageBuffer,
    settings: {
      productionType: 'sablon',
      removeBackground: true,
      separateColors: true,
      stickerCutlineEnabled: false
    },
    metadata: restore.metadata
  });
  const svg = Buffer.from(artifacts.artifacts.fullSvg.base64, 'base64').toString('utf8');
  assert.doesNotMatch(svg, /#7A6628/i);
  assert.match(svg, /#FFDA00/i);
  assert.doesNotMatch(svg, /\d+\.\d{3,}/);
});

test('color helpers detect near white background and nearest palette', () => {
  assert.equal(rgbToHex({ r: 12, g: 128, b: 255 }), '#0C80FF');
  assert.equal(isLowChroma({ r: 145, g: 145, b: 145 }), true);
  assert.equal(isLowChroma({ r: 218, g: 59, b: 82 }), false);
  assert.equal(isNearWhite({ r: 247, g: 248, b: 249 }), true);
  assert.equal(isNearWhite({ r: 240, g: 248, b: 249 }), false);
  assert.deepEqual(canonicalizeSpotPixel({ r: 229, g: 229, b: 228 }, { productionType: 'sablon' }), { r: 255, g: 255, b: 255 });
  assert.deepEqual(canonicalizeSpotPixel({ r: 93, g: 94, b: 100 }, { productionType: 'sablon' }), { r: 0, g: 0, b: 0 });
  assert.deepEqual(canonicalizeSpotPixel({ r: 249, g: 210, b: 4 }, { productionType: 'sablon' }), { r: 249, g: 210, b: 4 });
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

test('createMasksForPalette removes enclosed holes while keeping separate same-color objects', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-mask-hole-test-'));
  try {
    const sourcePath = path.join(tempDir, 'source.png');
    const maskDir = path.join(tempDir, 'masks');
    const png = new PNG({ width: 40, height: 40, colorType: 6 });

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const idx = (png.width * y + x) << 2;
        const isEdgeBackground = x < 4 || y < 4 || x >= png.width - 4 || y >= png.height - 4;
        png.data[idx] = isEdgeBackground ? 22 : 255;
        png.data[idx + 1] = isEdgeBackground ? 22 : 255;
        png.data[idx + 2] = isEdgeBackground ? 22 : 255;
        png.data[idx + 3] = 255;
      }
    }

    for (let y = 14; y < 34; y += 1) {
      for (let x = 14; x < 34; x += 1) {
        if (x >= 20 && x < 28 && y >= 20 && y < 28) {
          const idx = (png.width * y + x) << 2;
          png.data[idx] = 22;
          png.data[idx + 1] = 22;
          png.data[idx + 2] = 22;
          continue;
        }
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 218;
        png.data[idx + 1] = 59;
        png.data[idx + 2] = 82;
      }
    }

    for (let y = 7; y < 13; y += 1) {
      for (let x = 7; x < 13; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 22;
        png.data[idx + 1] = 22;
        png.data[idx + 2] = 22;
      }
    }

    await fs.writeFile(sourcePath, PNG.sync.write(png));
    await createMasksForPalette(
      sourcePath,
      [
        { index: 1, hex: '#161616', r: 22, g: 22, b: 22 },
        { index: 2, hex: '#DA3B52', r: 218, g: 59, b: 82 }
      ],
      maskDir,
      { whiteAsBackground: true }
    );

    const backgroundMask = PNG.sync.read(await fs.readFile(path.join(maskDir, 'color-01.png')));
    const redMask = PNG.sync.read(await fs.readFile(path.join(maskDir, 'color-02.png')));
    assert.equal(activeMaskPixelCount(backgroundMask), 36);
    assert.equal(activeMaskPixelCount(redMask), 336);
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

test('sablon quantize collapses grayscale anti-alias colors into black and white spot colors', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-spot-color-test-'));
  try {
    const sourcePath = path.join(tempDir, 'source.png');
    const png = new PNG({ width: 40, height: 10, colorType: 6 });
    const colors = [
      [20, 23, 32],
      [93, 94, 100],
      [229, 229, 228],
      [249, 210, 4]
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
    const quantized = await quantizeImage(sourcePath, {
      colorLimitMode: 'auto',
      whiteAsBackground: false,
      productionType: 'sablon',
      separateColors: true
    });

    assert.deepEqual(
      quantized.palette.map((color) => color.hex).sort(),
      ['#000000', '#F9D204', '#FFFFFF']
    );
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

test('film plan keeps full canvas by default and crops when background removal is enabled', () => {
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

  const preserved = createFilmPlan({ pathsByColor, width: 200, height: 100, settings: {} });
  assert.equal(preserved.backgroundColor, null);
  assert.deepEqual(preserved.colors.map((color) => color.index), [1, 2, 3]);
  assert.deepEqual(
    {
      x: preserved.bounds.x,
      y: preserved.bounds.y,
      width: preserved.bounds.width,
      height: preserved.bounds.height
    },
    { x: 0, y: 0, width: 200, height: 100 }
  );

  const cropped = createFilmPlan({
    pathsByColor,
    width: 200,
    height: 100,
    settings: { removeBackground: true }
  });
  assert.equal(cropped.backgroundColor.index, 1);
  assert.deepEqual(cropped.colors.map((color) => color.index), [2, 3]);
  assert.deepEqual(
    {
      x: cropped.bounds.x,
      y: cropped.bounds.y,
      width: cropped.bounds.width,
      height: cropped.bounds.height
    },
    { x: 50, y: 20, width: 110, height: 70 }
  );
});

test('film plan removes multiple edge background bands when enabled', () => {
  const pathsByColor = [
    {
      index: 1,
      hex: '#EFECE6',
      paths: ['M0 0 L200 0 L200 55 L0 55 Z']
    },
    {
      index: 2,
      hex: '#DCD7CF',
      paths: ['M0 45 L200 45 L200 100 L0 100 Z']
    },
    {
      index: 3,
      hex: '#111111',
      paths: ['M70 30 L130 30 L130 80 L70 80 Z']
    }
  ];

  const cropped = createFilmPlan({ pathsByColor, width: 200, height: 100, settings: { removeBackground: true } });
  assert.deepEqual(
    cropped.colors.map((color) => color.index),
    [3]
  );
  assert.deepEqual(
    cropped.backgroundColors.map((color) => color.index),
    [1, 2]
  );
  assert.deepEqual(
    {
      x: cropped.bounds.x,
      y: cropped.bounds.y,
      width: cropped.bounds.width,
      height: cropped.bounds.height
    },
    { x: 70, y: 30, width: 60, height: 50 }
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
    settings: { actualWidthCm: 10, paperSize: 'A4', paperOrientation: 'portrait', createUnderbaseFilm: true, removeBackground: true }
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
  assert.equal(settings.whiteAsBackground, false);
  assert.equal(settings.removeBackground, true);
  assert.equal(settings.inputMode, 'ready_trace');
  assert.equal(settings.makeVector, true);
  assert.equal(settings.colorLimitMode, 'auto');
  assert.equal(settings.stickerCutlineEnabled, true);
  assert.equal(settings.stickerCutlineOffsetMm, 2);
  assert.equal(settings.createUnderbaseFilm, false);
  assert.equal(settings.edgeRefinement, true);
  assert.equal(settings.curveCleanup, true);

  const includeBackground = validateSettings({ includeBackgroundInFilmSize: 'true' });
  assert.equal(includeBackground.includeBackgroundInFilmSize, true);

  const keepBackground = validateSettings({ removeBackground: 'false' });
  assert.equal(keepBackground.removeBackground, false);

  const removeBackground = validateSettings({ removeBackground: 'true' });
  assert.equal(removeBackground.removeBackground, true);

  const readyTrace = validateSettings({
    inputMode: 'ready_trace',
    colorLimitMode: 'manual',
    maxColors: '3',
    stickerCutlineOffsetMm: '1.5'
  });
  assert.equal(readyTrace.inputMode, 'ready_trace');
  assert.equal(readyTrace.makeVector, true);
  assert.equal(readyTrace.colorLimitMode, 'manual');
  assert.equal(readyTrace.maxColors, 3);
  assert.equal(readyTrace.stickerCutlineOffsetMm, 1.5);

  const readyTraceSticker = validateSettings({
    inputMode: 'ready_trace',
    productionType: 'sticker',
    stickerCutlineEnabled: 'false'
  });
  assert.equal(readyTraceSticker.makeVector, true);
  assert.equal(readyTraceSticker.stickerCutlineEnabled, true);

  const noRefinement = validateSettings({ edgeRefinement: 'false', curveCleanup: 'false' });
  assert.equal(noRefinement.edgeRefinement, false);
  assert.equal(noRefinement.curveCleanup, false);

  const sablon = validateSettings({ productionType: 'sablon' });
  assert.equal(sablon.createUnderbaseFilm, true);
});

test('refineTraceSourceImage upsamples trace source before vector trace', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-trace-refine-test-'));
  const previousScale = process.env.TRACE_EDGE_SOURCE_SCALE;
  const previousMax = process.env.TRACE_EDGE_MAX_DIMENSION;
  try {
    process.env.TRACE_EDGE_SOURCE_SCALE = '2';
    process.env.TRACE_EDGE_MAX_DIMENSION = '1024';
    const sourcePath = path.join(tempDir, 'source.png');
    const outputPath = path.join(tempDir, 'refined.png');
    const png = new PNG({ width: 12, height: 8, colorType: 6 });
    png.data.fill(255);
    for (let y = 2; y < 6; y += 1) {
      for (let x = 3; x < 9; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }
    await fs.writeFile(sourcePath, PNG.sync.write(png));

    const refined = await refineTraceSourceImage(sourcePath, outputPath, { edgeRefinement: true });
    const output = PNG.sync.read(await fs.readFile(outputPath));

    assert.equal(refined.enabled, true);
    assert.equal(refined.scale, 2);
    assert.equal(output.width, 24);
    assert.equal(output.height, 16);
  } finally {
    if (previousScale === undefined) delete process.env.TRACE_EDGE_SOURCE_SCALE;
    else process.env.TRACE_EDGE_SOURCE_SCALE = previousScale;
    if (previousMax === undefined) delete process.env.TRACE_EDGE_MAX_DIMENSION;
    else process.env.TRACE_EDGE_MAX_DIMENSION = previousMax;
    await fs.remove(tempDir);
  }
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
