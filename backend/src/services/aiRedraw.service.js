import fs from 'fs-extra';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';

const DIRECTOR_SYSTEM_INSTRUCTION = `You are a technical art director with 20 years of experience preparing artwork for sticker printing, manual screen printing, DTF, decal, and vector tracing workflows.

Your job is to inspect a messy uploaded image, recover the original design intent, and produce structured analysis plus one strict English technical redraw prompt for Imagen 3.

Rules:
1. Recover the actual artwork, not the camera background or paper backdrop.
2. Read text carefully and preserve wording, hierarchy, and placement. Repair obvious blur or aliasing mistakes only when they are clearly unintended defects.
3. Preserve the recognizable subject, composition, proportions, color placement, and major silhouette of the original design.
4. Reject photo gradients, shadows, glare, table color, paper color, compression noise, dust, and border-touching backdrop color as printable artwork.
5. If the same background color appears inside enclosed holes, counters, rings, boxes, or letter interiors, keep those holes non-printing as well.
6. Keep only dominant intentional artwork colors. Prefer flat solid color regions suitable for tracing and spot-color separation.
7. The redraw must look freshly rebuilt from shapes and color intent, not repaired from pixels.
8. The outermost silhouette must be smooth, closed, continuous, crisp, and easy to trace.
9. No photographic shading, no texture, no blur, no halftone, no accidental background layer.
10. Output JSON only, matching the requested schema.`;

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['subjectSummary', 'style', 'textDescription', 'dominantColors', 'backgroundPolicy', 'confidence', 'printNotes', 'technicalPrompt'],
  properties: {
    subjectSummary: { type: 'string' },
    style: { type: 'string' },
    textDescription: { type: 'string' },
    dominantColors: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        required: ['name', 'hex', 'role'],
        properties: {
          name: { type: 'string' },
          hex: { type: 'string' },
          role: { type: 'string' }
        }
      }
    },
    backgroundPolicy: { type: 'string' },
    confidence: {
      type: 'object',
      required: ['overall', 'text', 'shapes', 'colors'],
      properties: {
        overall: { type: 'number' },
        text: { type: 'number' },
        shapes: { type: 'number' },
        colors: { type: 'number' }
      }
    },
    printNotes: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 8
    },
    technicalPrompt: { type: 'string' },
    shouldRetryTextCarefully: { type: 'boolean' }
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function responseText(response) {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  return typeof response.text === 'string' ? response.text : '';
}

function estimateBackgroundColor(raw, width, height) {
  const border = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  let totalWeight = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x < border || y < border || x >= width - border || y >= height - border;
      if (!isBorder) continue;
      const offset = (y * width + x) * 4;
      const alpha = raw[offset + 3] / 255;
      if (alpha <= 0.05) continue;
      const weight = alpha;
      totalWeight += weight;
      totalR += raw[offset] * weight;
      totalG += raw[offset + 1] * weight;
      totalB += raw[offset + 2] * weight;
    }
  }

  if (totalWeight <= 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Math.round(totalR / totalWeight),
    g: Math.round(totalG / totalWeight),
    b: Math.round(totalB / totalWeight)
  };
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function colorChroma(pixel) {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function pixelAt(raw, index) {
  const offset = index * 4;
  return {
    r: raw[offset],
    g: raw[offset + 1],
    b: raw[offset + 2],
    a: raw[offset + 3]
  };
}

function isBackgroundCandidate(raw, index, background, threshold) {
  const pixel = pixelAt(raw, index);
  if (pixel.a <= 12) return true;
  const distance = colorDistance(pixel, background);
  if (distance <= threshold) return true;
  if (distance <= threshold * 0.7 && colorChroma(pixel) <= 42) return true;
  return false;
}

function clearBackgroundByBorderConnectivity(raw, width, height, background, threshold) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const clearMask = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const pushIfBackground = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (!isBackgroundCandidate(raw, index, background, threshold)) return;
    clearMask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    pushIfBackground(x, 0);
    pushIfBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushIfBackground(0, y);
    pushIfBackground(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    pushIfBackground(x - 1, y);
    pushIfBackground(x + 1, y);
    pushIfBackground(x, y - 1);
    pushIfBackground(x, y + 1);
  }

  return clearMask;
}

function softenHalo(raw, width, height, clearMask, background, threshold) {
  const haloMask = new Uint8Array(clearMask);
  const fringeThreshold = Math.max(12, threshold * 0.55);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (haloMask[index]) continue;
      const pixel = pixelAt(raw, index);
      if (pixel.a <= 12) {
        haloMask[index] = 1;
        continue;
      }
      const distance = colorDistance(pixel, background);
      if (distance > fringeThreshold) continue;
      const left = haloMask[index - 1];
      const right = haloMask[index + 1];
      const up = haloMask[index - width];
      const down = haloMask[index + width];
      if (left || right || up || down) {
        haloMask[index] = 1;
      }
    }
  }
  return haloMask;
}

function applyMask(raw, clearMask) {
  const output = Buffer.from(raw);
  for (let index = 0; index < clearMask.length; index += 1) {
    if (!clearMask[index]) continue;
    const offset = index * 4;
    output[offset + 3] = 0;
  }
  return output;
}

function findOpaqueBounds(raw, width, height, alphaCutoff = 20) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[(y * width + x) * 4 + 3];
      if (alpha < alphaCutoff) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY };
}

function chooseAspectRatio(width, height) {
  const ratio = width / height;
  const candidates = [
    ['1:1', 1],
    ['3:4', 0.75],
    ['4:3', 4 / 3],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9]
  ];
  return candidates.reduce(
    (best, current) => {
      const diff = Math.abs(ratio - current[1]);
      return diff < best.diff ? { label: current[0], diff } : best;
    },
    { label: '1:1', diff: Number.POSITIVE_INFINITY }
  ).label;
}

function dominantColorsToPrompt(colors = []) {
  if (!Array.isArray(colors) || colors.length === 0) {
    return 'Use only dominant intentional artwork colors as flat solid fills.';
  }

  return `Use these dominant artwork colors as flat solid fills only: ${colors
    .map((color) => `${color.name || 'unnamed'} ${color.hex || ''}`.trim())
    .join(', ')}.`;
}

function printTargetInstruction(settings) {
  if (settings.productionType === 'sablon') {
    return 'Optimize for manual screen printing and backend vector tracing. Keep spot-color regions intentional, separable, and easy to trace into clean vector masks.';
  }
  return 'Optimize for sticker production and backend vector tracing. Keep the silhouette attractive, closed, and clean for cutline generation.';
}

export function buildDirectorSystemInstruction() {
  return DIRECTOR_SYSTEM_INSTRUCTION;
}

export function buildRedrawPrompt(settings = {}, analysis = {}) {
  const dominantColors = dominantColorsToPrompt(analysis.dominantColors);
  const subjectSummary = analysis.subjectSummary || 'Faithfully redraw the uploaded artwork as a clean flat cartoon/vector-style graphic.';
  const style = analysis.style || 'Flat vector logo illustration';
  const textDescription =
    analysis.textDescription ||
    'Preserve all readable lettering, symbols, and layout from the source image as clean bold shapes.';
  const backgroundPolicy =
    analysis.backgroundPolicy ||
    'Remove all camera background, border-touching gradients, paper color, table color, glare, shadow, and empty background. Keep enclosed holes non-printing.';
  const printNotes = Array.isArray(analysis.printNotes) && analysis.printNotes.length > 0 ? analysis.printNotes.join(' ') : '';
  const whiteInstruction = settings.whiteAsBackground
    ? 'Treat white, near-white, and paper-like empty background as non-printing space unless it is clearly enclosed printable artwork.'
    : 'Treat white inside the actual artwork as a printable color when it is clearly part of the design, but still keep empty background non-printing.';
  const colorLimitInstruction =
    settings.colorLimitMode === 'manual' && settings.maxColors
      ? `Keep the redraw within about ${settings.maxColors} dominant printable solid colors after rejecting non-artwork background tones.`
      : 'Keep only the dominant intentional artwork colors. Merge redundant shading and reject photo lighting colors.';

  return [
    `${style}. ${subjectSummary}`,
    textDescription,
    dominantColors,
    backgroundPolicy,
    whiteInstruction,
    colorLimitInstruction,
    'This is a true redraw from shape intent and color placement, not pixel repair, not sharpening, not upscaling, and not preserving rough raster noise.',
    'Rebuild the outermost artwork silhouette as smooth, clean, closed, continuous, crisp, high-density contours with no jagged steps, no broken edges, and no accidental gaps.',
    'Use solid flat colors only. No gradients, no glow, no texture, no paper, no table, no cast shadow, no camera lighting, and no rectangular background layer.',
    'If the same background color appears through enclosed holes inside letters, rings, or boxes, keep those holes empty and non-printing instead of filling them as artwork.',
    printTargetInstruction(settings),
    printNotes,
    'Return a clean isolated artwork redraw that is ready to be traced into vector shapes.'
  ]
    .filter(Boolean)
    .join(' ');
}

function buildAnalysisUserPrompt(settings, preprocessMeta) {
  return [
    'Analyze the uploaded artwork and recover the original design intent.',
    'Output structured JSON and include one final English technical redraw prompt for Imagen 3 in the technicalPrompt field.',
    `Production target: ${settings.productionType === 'sablon' ? 'manual screen printing and vector tracing' : 'sticker production and vector tracing'}.`,
    settings.colorLimitMode === 'manual' && settings.maxColors
      ? `The final redraw should preserve only about ${settings.maxColors} dominant printable artwork colors after removing background and lighting colors.`
      : 'Keep only dominant intentional artwork colors after removing background and lighting colors.',
    settings.whiteAsBackground
      ? 'White, near-white, paper, glare, and outside empty background should normally be treated as non-printing unless clearly enclosed inside the intentional design.'
      : 'White can stay only when it is clearly intentional artwork inside the design. Empty background must still be non-printing.',
    `The preprocessed reference is already cropped and background-cleaned with a ${preprocessMeta.preprocess} heuristic.`,
    'Preserve readable text, composition, color placement, and silhouette. Reject camera border color, paper tone, table tone, blur noise, compression artifacts, and lighting gradients as artwork.',
    'The final technicalPrompt must instruct Imagen 3 to redraw from scratch as clean flat vector-like artwork with smooth trace-ready contours.'
  ].join(' ');
}

function normalizeAnalysisPayload(payload = {}, settings = {}) {
  const confidence = payload.confidence && typeof payload.confidence === 'object' ? payload.confidence : {};
  const normalized = {
    subjectSummary: typeof payload.subjectSummary === 'string' ? payload.subjectSummary.trim() : '',
    style: typeof payload.style === 'string' ? payload.style.trim() : 'Flat vector logo illustration',
    textDescription: typeof payload.textDescription === 'string' ? payload.textDescription.trim() : '',
    dominantColors: Array.isArray(payload.dominantColors)
      ? payload.dominantColors
          .map((color) => ({
            name: typeof color?.name === 'string' ? color.name.trim() : 'Artwork color',
            hex: typeof color?.hex === 'string' ? color.hex.trim().toUpperCase() : '#000000',
            role: typeof color?.role === 'string' ? color.role.trim() : 'artwork'
          }))
          .filter((color) => color.hex)
      : [],
    backgroundPolicy:
      typeof payload.backgroundPolicy === 'string' && payload.backgroundPolicy.trim()
        ? payload.backgroundPolicy.trim()
        : 'Remove border-touching background colors and keep empty holes non-printing.',
    confidence: {
      overall: clamp(Number(confidence.overall) || 0.7, 0, 1),
      text: clamp(Number(confidence.text) || 0.7, 0, 1),
      shapes: clamp(Number(confidence.shapes) || 0.7, 0, 1),
      colors: clamp(Number(confidence.colors) || 0.7, 0, 1)
    },
    printNotes: Array.isArray(payload.printNotes) ? payload.printNotes.map((note) => String(note).trim()).filter(Boolean) : [],
    shouldRetryTextCarefully: payload.shouldRetryTextCarefully === true,
    technicalPrompt: typeof payload.technicalPrompt === 'string' ? payload.technicalPrompt.trim() : ''
  };

  if (!normalized.textDescription) {
    normalized.textDescription =
      settings.productionType === 'sablon'
        ? 'Preserve lettering and color placement as clean spot-color shapes suitable for tracing and film separation.'
        : 'Preserve lettering and color placement as clean sticker-ready shapes suitable for tracing.';
  }

  if (!normalized.technicalPrompt) {
    normalized.technicalPrompt = buildRedrawPrompt(settings, normalized);
  }

  if (!normalized.subjectSummary) {
    normalized.subjectSummary = 'Faithfully redraw the uploaded artwork as a clean isolated cartoon/vector-style design.';
  }

  return normalized;
}

function shouldRetryHybrid(aiConfig, analysis) {
  if (!aiConfig.retryOnLowConfidence) return false;
  const confidence = analysis?.confidence || {};
  return (confidence.overall || 0) < 0.78 || (confidence.text || 0) < 0.74 || analysis?.shouldRetryTextCarefully === true;
}

function buildRetryPrompt(technicalPrompt, analysis) {
  const caution = analysis?.textDescription
    ? `Extra caution: ${analysis.textDescription}`
    : 'Extra caution: preserve lettering exactly as intended and avoid losing enclosed counters or small symbols.';
  return `${technicalPrompt} ${caution} Rebuild the outer contour even more smoothly, remove any leftover background-looking tone, and keep enclosed holes open and non-printing.`;
}

function createVertexClient() {
  const project =
    process.env.VERTEX_AI_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  if (!project) {
    throw new Error('VERTEX_AI_PROJECT atau GOOGLE_CLOUD_PROJECT belum dikonfigurasi.');
  }
  return new GoogleGenAI({
    vertexai: true,
    project,
    location
  });
}

async function preprocessForHybridRedraw(buffer, preprocessName) {
  const maxDimension = Math.min(3072, Math.max(1024, Number.parseInt(process.env.PREPROCESS_MAX_DIMENSION || '2048', 10)));
  const normalized = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const source = sharp(normalized).ensureAlpha();
  const sourceMeta = await source.metadata();
  const width = sourceMeta.width || 0;
  const height = sourceMeta.height || 0;
  if (!width || !height) {
    throw new Error('Gagal membaca ukuran gambar untuk hybrid redraw.');
  }

  const { data: raw } = await source.raw().toBuffer({ resolveWithObject: true });
  const background = estimateBackgroundColor(raw, width, height);
  const threshold = colorChroma(background) <= 32 ? 38 : 52;
  const borderMask = clearBackgroundByBorderConnectivity(raw, width, height, background, threshold);
  const softenedMask = softenHalo(raw, width, height, borderMask, background, threshold);
  const cleanedRaw = applyMask(raw, softenedMask);
  const bounds = findOpaqueBounds(cleanedRaw, width, height, 20);

  let cleanedBuffer;
  let cleanedWidth = width;
  let cleanedHeight = height;
  if (bounds) {
    const padding = Math.max(12, Math.round(Math.min(width, height) * 0.03));
    const left = Math.max(0, bounds.minX - padding);
    const top = Math.max(0, bounds.minY - padding);
    const cropWidth = Math.min(width - left, bounds.maxX - bounds.minX + 1 + padding * 2);
    const cropHeight = Math.min(height - top, bounds.maxY - bounds.minY + 1 + padding * 2);
    cleanedWidth = cropWidth;
    cleanedHeight = cropHeight;
    cleanedBuffer = await sharp(cleanedRaw, { raw: { width, height, channels: 4 } })
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
  } else {
    cleanedBuffer = normalized;
  }

  return {
    normalizedBuffer: normalized,
    analysisBuffer: cleanedBuffer,
    preprocess: preprocessName,
    width: cleanedWidth,
    height: cleanedHeight,
    aspectRatio: chooseAspectRatio(cleanedWidth, cleanedHeight),
    backgroundColor: background
  };
}

async function analyzeArtworkWithGemini(client, analysisBuffer, settings, aiConfig, preprocessMeta) {
  const response = await client.models.generateContent({
    model: aiConfig.analysisModel,
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildAnalysisUserPrompt(settings, preprocessMeta) },
          {
            inlineData: {
              mimeType: 'image/png',
              data: analysisBuffer.toString('base64')
            }
          }
        ]
      }
    ],
    config: {
      systemInstruction: buildDirectorSystemInstruction(),
      responseMimeType: 'application/json',
      responseJsonSchema: ANALYSIS_RESPONSE_SCHEMA,
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 1400
    }
  });

  const rawText = responseText(response);
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }
  return normalizeAnalysisPayload(parsed, settings);
}

async function generateWithImagen(client, technicalPrompt, aiConfig, preprocessMeta) {
  const response = await client.models.generateImages({
    model: aiConfig.generationModel,
    prompt: technicalPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: preprocessMeta.aspectRatio,
      outputMimeType: 'image/png',
      includeRaiReason: true,
      enhancePrompt: false,
      guidanceScale: aiConfig.resolutionPolicy === 'high' ? 15 : aiConfig.resolutionPolicy === 'standard' ? 13 : 11
    }
  });

  const b64 = response?.generatedImages?.[0]?.image?.imageBytes;
  if (!b64) {
    const raiReason = response?.generatedImages?.[0]?.raiFilteredReason || response?.generatedImages?.[0]?.raiReason || '';
    throw new Error(`Imagen tidak mengembalikan gambar.${raiReason ? ` RAI: ${raiReason}` : ''}`);
  }

  return Buffer.from(b64, 'base64');
}

async function postprocessGeneratedImage(buffer, preprocessName) {
  const prepared = await preprocessForHybridRedraw(buffer, preprocessName);
  return prepared.analysisBuffer;
}

function summarizeAnalysis(analysis) {
  return {
    subjectSummary: analysis.subjectSummary,
    style: analysis.style,
    textDescription: analysis.textDescription,
    dominantColors: analysis.dominantColors,
    backgroundPolicy: analysis.backgroundPolicy,
    confidence: {
      overall: roundTo(analysis.confidence.overall),
      text: roundTo(analysis.confidence.text),
      shapes: roundTo(analysis.confidence.shapes),
      colors: roundTo(analysis.confidence.colors)
    },
    printNotes: analysis.printNotes
  };
}

export async function hybridRedrawBuffer(uploadedBuffer, settings = {}, configOverride = {}) {
  const aiConfig = normalizeHybridRedrawConfig(configOverride, process.env);
  const preprocessMeta = await preprocessForHybridRedraw(uploadedBuffer, aiConfig.preprocess);

  if (process.env.NODE_ENV === 'test' && process.env.AI_REDRAW_MOCK === '1') {
    const analysis = normalizeAnalysisPayload(
      {
        subjectSummary: 'Mock redraw for tests.',
        style: 'Flat vector logo illustration',
        textDescription: 'Preserve visible lettering as clean shapes.',
        dominantColors: [{ name: 'Black', hex: '#000000', role: 'primary' }],
        backgroundPolicy: 'Remove border-connected background.',
        confidence: { overall: 0.99, text: 0.99, shapes: 0.99, colors: 0.99 },
        printNotes: ['Mock mode keeps the local route test deterministic.']
      },
      settings
    );

    return {
      imageBuffer: preprocessMeta.analysisBuffer,
      metadata: {
        provider: aiConfig.provider,
        analysisModel: aiConfig.analysisModel,
        generationModel: aiConfig.generationModel,
        preset: aiConfig.preset,
        preprocess: aiConfig.preprocess,
        aspectPolicy: aiConfig.aspectPolicy,
        resolutionPolicy: aiConfig.resolutionPolicy,
        analysisSummary: summarizeAnalysis(analysis),
        technicalPrompt: buildRedrawPrompt(settings, analysis),
        retryUsed: false,
        sourceAspectRatio: preprocessMeta.aspectRatio
      }
    };
  }

  const client = createVertexClient();
  const analysis = await analyzeArtworkWithGemini(client, preprocessMeta.analysisBuffer, settings, aiConfig, preprocessMeta);
  const technicalPrompt = analysis.technicalPrompt || buildRedrawPrompt(settings, analysis);
  let generated = await generateWithImagen(client, technicalPrompt, aiConfig, preprocessMeta);
  let retryUsed = false;

  if (shouldRetryHybrid(aiConfig, analysis)) {
    generated = await generateWithImagen(client, buildRetryPrompt(technicalPrompt, analysis), aiConfig, preprocessMeta);
    retryUsed = true;
  }

  const cleanedOutput = await postprocessGeneratedImage(generated, aiConfig.preprocess);

  return {
    imageBuffer: cleanedOutput,
    metadata: {
      provider: aiConfig.provider,
      analysisModel: aiConfig.analysisModel,
      generationModel: aiConfig.generationModel,
      preset: aiConfig.preset,
      preprocess: aiConfig.preprocess,
      aspectPolicy: aiConfig.aspectPolicy,
      resolutionPolicy: aiConfig.resolutionPolicy,
      analysisSummary: summarizeAnalysis(analysis),
      technicalPrompt,
      retryUsed,
      sourceAspectRatio: preprocessMeta.aspectRatio
    }
  };
}

export function qualityToImageOption() {
  return 'hybrid';
}

export async function redrawWithAI(inputImagePath, outputPath, settings) {
  const inputBuffer = await fs.readFile(inputImagePath);
  const result = await hybridRedrawBuffer(inputBuffer, settings);
  await fs.writeFile(outputPath, result.imageBuffer);
  return {
    outputPath,
    mocked: process.env.NODE_ENV === 'test' && process.env.AI_REDRAW_MOCK === '1',
    prompt: result.metadata.technicalPrompt,
    metadata: result.metadata
  };
}
