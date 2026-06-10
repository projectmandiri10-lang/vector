import fs from 'fs-extra';
import sharp from 'sharp';
import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';
import { logoRestoreBuffer } from './logoRestore.service.js';
import { assessImageQuality } from './imageQuality.service.js';

const DIRECTOR_SYSTEM_INSTRUCTION = `You are a technical art director with 20 years of experience preparing artwork for sticker printing, manual screen printing, DTF, decal, and vector tracing workflows.

Your job is to inspect a messy uploaded image, recover the original design intent, and produce structured analysis plus one strict English technical redraw prompt for the image generation model.

Rules:
1. Recover the actual artwork, not the camera background or paper backdrop.
2. Read text carefully and preserve exact wording, hierarchy, and placement. Repair obvious blur or aliasing mistakes only when they are clearly unintended defects.
3. Preserve the recognizable subject, composition, proportions, color placement, and major silhouette of the original design.
4. Reject photo gradients, shadows, glare, table color, paper color, compression noise, dust, and border-touching backdrop color as printable artwork.
5. If the same background color appears inside enclosed holes, counters, rings, boxes, or letter interiors, keep those holes non-printing as well.
6. Keep only dominant intentional artwork colors. Prefer flat solid color regions suitable for tracing and spot-color separation.
7. The redraw must look freshly rebuilt from shapes and color intent, not repaired from pixels, OCR output, scan cleanup, sharpening, or upscaling.
8. The outermost silhouette must be smooth, closed, continuous, crisp, and easy to trace.
9. No photographic shading, no texture, no blur, no halftone, no accidental background layer.
10. The technicalPrompt must be strict enough that a text-to-image model rebuilds the artwork as clean flat vector-like art, not as a restored photo or scanned document.
11. Output JSON only, matching the requested schema.`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    'Preserve exact readable text, lettering hierarchy, symbol placement, and layout from the source artwork as deliberate clean shapes.',
    'This is a true redraw from shape intent and color placement, not pixel repair, not OCR reconstruction, not scan cleanup, not sharpening, not upscaling, and not preserving rough raster noise.',
    'Rebuild the outermost artwork silhouette as smooth, clean, closed, continuous, crisp, high-density contours with no jagged steps, no broken edges, and no accidental gaps.',
    'Use solid flat colors only. No gradients, no glow, no texture, no paper, no table, no cast shadow, no camera lighting, no scan artifacts, and no rectangular background layer.',
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
    'Analyze the uploaded artwork references and recover the original design intent.',
    'Reference image 1 is the normalized original upload. Use it to understand context, full composition, colors, and all text.',
    'Reference image 2 is the cleaned/cropped trace target. Use it to identify the printable artwork area after rejecting border-connected background.',
    'Output structured JSON and include one final English technical redraw prompt for the image generation model in the technicalPrompt field.',
    `Production target: ${settings.productionType === 'sablon' ? 'manual screen printing and vector tracing' : 'sticker production and vector tracing'}.`,
    settings.colorLimitMode === 'manual' && settings.maxColors
      ? `The final redraw should preserve only about ${settings.maxColors} dominant printable artwork colors after removing background and lighting colors.`
      : 'Keep only dominant intentional artwork colors after removing background and lighting colors.',
    settings.whiteAsBackground
      ? 'White, near-white, paper, glare, and outside empty background should normally be treated as non-printing unless clearly enclosed inside the intentional design.'
      : 'White can stay only when it is clearly intentional artwork inside the design. Empty background must still be non-printing.',
    `The cleaned reference is already cropped and background-cleaned with a ${preprocessMeta.preprocess} heuristic.`,
    'Extract exact readable text, lettering hierarchy, composition, color placement, major silhouette, and trace-critical edges.',
    'Reject camera border color, paper tone, table tone, blur noise, compression artifacts, lighting gradients, scan texture, and OCR-looking artifacts as artwork.',
    'The final technicalPrompt must instruct the image model to redraw from scratch as clean flat vector-like artwork with smooth trace-ready contours, not to enhance, sharpen, upscale, OCR, or restore a scanned image.'
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

function exposeAiError(error) {
  error.expose = true;
  return error;
}

function openRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function openRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENROUTER_API_KEY belum dikonfigurasi.');
    error.status = 500;
    error.upstream = 'openrouter';
    throw exposeAiError(error);
  }
  return apiKey;
}

function openRouterHeaders() {
  const headers = {
    Authorization: `Bearer ${openRouterApiKey()}`,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en'
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
  }
  return headers;
}

async function openRouterJsonFetch(path, body) {
  const response = await fetch(`${openRouterBaseUrl()}${path}`, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        const error = new Error(`OpenRouter mengembalikan respons non-JSON (${response.status}).`);
        error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
        error.upstream = 'openrouter';
        error.responseText = text.slice(0, 500);
        throw exposeAiError(error);
      }
      const error = new Error('Respons OpenRouter tidak valid JSON.');
      error.status = 502;
      error.upstream = 'openrouter';
      error.responseText = text.slice(0, 500);
      throw exposeAiError(error);
    }
  }
  if (!response.ok) {
    const upstreamMessage = data?.error?.message || data?.message || data?.error || `OpenRouter request gagal: ${response.status}`;
    const message = /insufficient balance|no credit|credits|quota|rate limit/i.test(upstreamMessage)
      ? 'Saldo, kredit, atau rate limit OpenRouter tidak cukup. Periksa billing OpenRouter lalu coba gambar ulang lagi.'
      : upstreamMessage;
    const error = new Error(message);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.upstream = 'openrouter';
    throw exposeAiError(error);
  }
  return data;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    return {};
  }
}

function imageDataUrl(buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function configuredMaxImageInputBytes() {
  const configured = Number.parseInt(process.env.OPENROUTER_MAX_IMAGE_INPUT_BYTES || '3200000', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 3200000;
}

async function compressedImageDataUrl(buffer, label, maxBytes = configuredMaxImageInputBytes()) {
  const attempts = [
    { format: 'png', scale: 1, quality: 100 },
    { format: 'webp', scale: 1, quality: 92 },
    { format: 'webp', scale: 0.85, quality: 90 },
    { format: 'webp', scale: 0.7, quality: 88 },
    { format: 'webp', scale: 0.55, quality: 86 },
    { format: 'webp', scale: 0.4, quality: 84 }
  ];
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;

  for (const attempt of attempts) {
    let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
    if (attempt.scale < 1 && sourceWidth && sourceHeight) {
      pipeline = pipeline.resize({
        width: Math.max(1, Math.round(sourceWidth * attempt.scale)),
        height: Math.max(1, Math.round(sourceHeight * attempt.scale)),
        fit: 'inside'
      });
    }

    const output =
      attempt.format === 'webp'
        ? await pipeline.webp({ quality: attempt.quality, alphaQuality: 100 }).toBuffer()
        : await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

    if (output.length <= maxBytes) {
      return imageDataUrl(output, attempt.format === 'webp' ? 'image/webp' : 'image/png');
    }
  }

  const error = new Error(
    `Gambar referensi terlalu besar untuk model image OpenRouter (${label}). Turunkan PREPROCESS_MAX_DIMENSION atau OPENROUTER_IMAGE_SIZE lalu coba lagi.`
  );
  error.status = 413;
  error.upstream = 'openrouter';
  throw exposeAiError(error);
}

async function prepareOpenRouterImageReferences(preprocessMeta) {
  const maxReferenceBytes = configuredMaxImageInputBytes();
  const maxContextBytes = Math.min(1500000, Math.max(600000, Math.floor(maxReferenceBytes / 2)));
  return {
    ...preprocessMeta,
    normalizedDataUrl: await compressedImageDataUrl(preprocessMeta.normalizedBuffer, 'normalized original', maxContextBytes),
    analysisDataUrl: await compressedImageDataUrl(preprocessMeta.analysisBuffer, 'cleaned trace target', maxReferenceBytes)
  };
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

export function buildOpenRouterAnalysisRequest(preprocessMeta, settings, aiConfig) {
  return {
    model: aiConfig.analysisModel,
    messages: [
      {
        role: 'system',
        content: `${buildDirectorSystemInstruction()}\nReturn only valid JSON with these top-level fields: subjectSummary, style, textDescription, dominantColors, backgroundPolicy, confidence, printNotes, technicalPrompt, shouldRetryTextCarefully.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Reference image 1: normalized original upload. Preserve context, full composition, original text, and intended color placement from this image.'
          },
          {
            type: 'image_url',
            image_url: {
              url: preprocessMeta.normalizedDataUrl || imageDataUrl(preprocessMeta.normalizedBuffer)
            }
          },
          {
            type: 'text',
            text: 'Reference image 2: cleaned and cropped trace target after background cleanup. Use this to decide the printable artwork area and smooth trace-ready silhouette.'
          },
          {
            type: 'image_url',
            image_url: {
              url: preprocessMeta.analysisDataUrl || imageDataUrl(preprocessMeta.analysisBuffer)
            }
          },
          {
            type: 'text',
            text: buildAnalysisUserPrompt(settings, preprocessMeta)
          }
        ]
      }
    ],
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
    stream: false
  };
}

export function buildOpenRouterSafetyRequest(preprocessMeta, settings, aiConfig) {
  return {
    model: aiConfig.safetyModel,
    messages: [
      {
        role: 'system',
        content:
          'You are a visual content safety classifier. Return only JSON with fields safe:boolean, reason:string, categories:string[]. Be conservative only for explicit policy-risk content.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Classify whether this artwork is safe to process in a custom print/vector redraw workflow.',
              'Allow ordinary logos, product art, sticker designs, typography, brand-like artwork, and blurry photos of printable artwork.',
              'Block only explicit sexual content, child sexual content, graphic violence, hate/extremism, self-harm instructions, illegal activity, personal ID documents, or private personal data.',
              `Production target: ${settings.productionType === 'sablon' ? 'screen printing' : 'sticker/vector output'}.`
            ].join(' ')
          },
          {
            type: 'text',
            text: 'Reference image 1: normalized original upload for full visual context.'
          },
          {
            type: 'image_url',
            image_url: {
              url: preprocessMeta.normalizedDataUrl || imageDataUrl(preprocessMeta.normalizedBuffer)
            }
          },
          {
            type: 'text',
            text: 'Reference image 2: cleaned trace target for the actual printable artwork.'
          },
          {
            type: 'image_url',
            image_url: {
              url: preprocessMeta.analysisDataUrl || imageDataUrl(preprocessMeta.analysisBuffer)
            }
          }
        ]
      }
    ],
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    stream: false
  };
}

export function parseOpenRouterSafetyResult(rawText) {
  const text = String(rawText || '').trim();
  const parsed = extractJsonObject(text);
  const verdict = String(parsed.verdict || parsed.safety || parsed.result || parsed.status || '').toLowerCase();
  const reason = String(parsed.reason || parsed.explanation || parsed.message || text || '').trim();
  const safeValue = parsed.safe ?? parsed.is_safe ?? parsed.isSafe ?? parsed.allowed;

  if (typeof safeValue === 'boolean') {
    return { safe: safeValue, reason: reason || (safeValue ? 'Safe.' : 'Unsafe.'), rawText: text };
  }
  if (['safe', 'allowed', 'compliant', 'ok'].includes(verdict)) {
    return { safe: true, reason: reason || 'Safe.', rawText: text };
  }
  if (['unsafe', 'blocked', 'disallowed', 'violation', 'not_safe'].includes(verdict)) {
    return { safe: false, reason: reason || 'Unsafe.', rawText: text };
  }

  const lower = text.toLowerCase();
  if (/no unsafe|not unsafe|safe to process|allowed|compliant/.test(lower)) {
    return { safe: true, reason: reason || 'Safe.', rawText: text };
  }
  if (/\bunsafe\b|disallowed|violation|not safe|child sexual|graphic violence|self-harm|extremism|private personal data/.test(lower)) {
    return { safe: false, reason: reason || 'Unsafe.', rawText: text };
  }
  return { safe: true, reason: reason || 'No safety issue detected.', rawText: text };
}

async function checkOpenRouterSafety(preprocessMeta, settings, aiConfig) {
  if (!aiConfig.safetyEnabled) {
    return { safe: true, reason: 'Safety gate disabled by config.', skipped: true };
  }

  const data = await openRouterJsonFetch('/chat/completions', buildOpenRouterSafetyRequest(preprocessMeta, settings, aiConfig));
  const rawText = data?.choices?.[0]?.message?.content || '';
  const result = parseOpenRouterSafetyResult(rawText);
  if (!result.safe) {
    const error = new Error(`Gambar tidak bisa diproses oleh safety gate OpenRouter/Nemotron. ${result.reason}`.trim());
    error.status = 400;
    error.upstream = 'openrouter';
    throw exposeAiError(error);
  }
  return result;
}

async function analyzeArtworkWithOpenRouter(preprocessMeta, settings, aiConfig) {
  const data = await openRouterJsonFetch('/chat/completions', buildOpenRouterAnalysisRequest(preprocessMeta, settings, aiConfig));

  const rawText = data?.choices?.[0]?.message?.content || '';
  return normalizeAnalysisPayload(extractJsonObject(rawText), settings);
}

function buildOpenRouterGeneratorPrompt(technicalPrompt, aiConfig) {
  return [
    'Use the uploaded image as the direct visual reference for an image-to-image redraw.',
    'Redraw the artwork faithfully as flat solid vector-like art, not as OCR, scan repair, sharpening, enhancement, upscaling, or a cleaned screenshot.',
    'Do not trace or preserve the jagged pixel boundary of the reference image; infer the intended smooth manual-vector contour behind the rough raster edge.',
    'Preserve exact readable text, text placement, lettering hierarchy, dominant colors, silhouette, enclosed holes, and symbol positions from the reference.',
    'Create smooth closed contours, clean high-density edges, flat color fills, and trace-ready shapes for vectorization, screen printing, sticker cutting, and color separation.',
    'Remove all paper, table, camera background, shadows, glare, texture, compression noise, pixel blocks, halftone, scan artifacts, rectangular background layers, and jagged mask noise.',
    `Output background mode: ${aiConfig.backgroundMode || 'transparent'}.`,
    `Target image size: ${aiConfig.imageSize || '2K'}.`,
    `Quality target: ${aiConfig.generationQuality || 'high'}.`,
    technicalPrompt
  ].join(' ');
}

function riverflowScoringPrompt() {
  return [
    'Score high only if the output is a faithful rebuilt artwork, not scan cleanup.',
    'Prefer smooth closed vector-like contours, exact text placement, flat solid colors, transparent/removed background, and no pixel blocks.',
    'Score low for OCR-like substitutions, rough edges, shadows, paper/table background, blur, texture, and broken lettering.'
  ].join(' ');
}

export function buildOpenRouterImageGenerationRequest(technicalPrompt, aiConfig, preprocessMeta) {
  return {
    model: aiConfig.generationModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildOpenRouterGeneratorPrompt(technicalPrompt, aiConfig)
          },
          {
            type: 'image_url',
            image_url: {
              url: preprocessMeta.analysisDataUrl || imageDataUrl(preprocessMeta.analysisBuffer)
            }
          }
        ]
      }
    ],
    modalities: ['image', 'text'],
    image_config: {
      image_size: aiConfig.imageSize || '2K',
      background_mode: aiConfig.backgroundMode || 'transparent',
      scoring_prompt: riverflowScoringPrompt(),
      scoring_rubric: '0-2: OCR/scan cleanup or noisy raster. 3-5: partially faithful but jagged or background remains. 6-8: clean redraw with mostly smooth contours and correct text/layout. 9-10: manual-vector-like, flat colors, exact text placement, transparent background, trace-ready.'
    },
    reasoning: {
      effort: aiConfig.reasoningEffort || 'medium'
    },
    temperature: 0.2,
    top_p: 0.9,
    stream: false
  };
}

export function extractOpenRouterImageReference(data) {
  const message = data?.choices?.[0]?.message || {};
  const images = Array.isArray(message.images) ? message.images : [];
  for (const image of images) {
    const url = image?.image_url?.url || image?.imageUrl?.url || image?.url;
    if (url) return url;
  }

  const content = Array.isArray(message.content) ? message.content : [];
  for (const part of content) {
    const url = part?.image_url?.url || part?.imageUrl?.url || part?.url;
    if (url) return url;
  }

  if (typeof message.content === 'string') {
    const dataUrl = message.content.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i)?.[0];
    if (dataUrl) return dataUrl;
  }

  return data?.data?.[0]?.url || data?.url || '';
}

async function downloadOpenRouterImageResult(imageUrl) {
  const retryDelaysMs = [0, 3000, 8000, 15000, 30000];
  let lastError = null;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    const delayMs = retryDelaysMs[attempt];
    if (delayMs > 0) await sleep(delayMs);

    const imageResponse = await fetch(imageUrl);
    const contentType = imageResponse.headers.get('content-type') || '';
    if (imageResponse.ok) {
      if (contentType && !/^image\/|application\/octet-stream/i.test(contentType)) {
        const error = new Error(`URL hasil OpenRouter image model tidak mengembalikan file gambar (${contentType}).`);
        error.status = 502;
        error.upstream = 'openrouter';
        throw exposeAiError(error);
      }

      return Buffer.from(await imageResponse.arrayBuffer());
    }

    const responseText = await imageResponse.text().catch(() => '');
    const isRetryableStatus = imageResponse.status === 404 || imageResponse.status === 429 || imageResponse.status >= 500;
    lastError = new Error(`Gagal mengunduh hasil OpenRouter image model: ${imageResponse.status}`);
    lastError.status = imageResponse.status >= 400 && imageResponse.status < 500 && imageResponse.status !== 404 ? imageResponse.status : 502;
    lastError.upstream = 'openrouter';
    lastError.responseText = responseText.slice(0, 500);

    if (!isRetryableStatus || attempt === retryDelaysMs.length - 1) {
      throw exposeAiError(lastError);
    }
  }

  throw exposeAiError(lastError || Object.assign(new Error('Gagal mengunduh hasil OpenRouter image model.'), { status: 502, upstream: 'openrouter' }));
}

async function bufferFromOpenRouterImageReference(imageReference) {
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageReference)) {
    return Buffer.from(imageReference.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64');
  }

  if (/^[A-Za-z0-9+/=]+$/.test(imageReference) && imageReference.length > 100) {
    return Buffer.from(imageReference, 'base64');
  }

  if (/^https?:\/\//i.test(imageReference)) {
    return downloadOpenRouterImageResult(imageReference);
  }

  const error = new Error('OpenRouter image model mengembalikan referensi gambar yang tidak dikenali.');
  error.status = 502;
  error.upstream = 'openrouter';
  throw exposeAiError(error);
}

async function generateWithOpenRouterImage(technicalPrompt, aiConfig, preprocessMeta) {
  const data = await openRouterJsonFetch('/chat/completions', buildOpenRouterImageGenerationRequest(technicalPrompt, aiConfig, preprocessMeta));
  const imageReference = extractOpenRouterImageReference(data);
  if (!imageReference) {
    const text = data?.choices?.[0]?.message?.content;
    const error = new Error(
      text
        ? `OpenRouter image model tidak mengembalikan gambar. Respons teks: ${String(text).slice(0, 500)}`
        : 'OpenRouter image model tidak mengembalikan URL gambar atau base64 image.'
    );
    error.status = 502;
    error.upstream = 'openrouter';
    throw exposeAiError(error);
  }

  return bufferFromOpenRouterImageReference(imageReference);
}

async function postprocessGeneratedImage(buffer, preprocessName) {
  try {
    const prepared = await preprocessForHybridRedraw(buffer, preprocessName);
    return prepared.analysisBuffer;
  } catch (error) {
    try {
      return await sharp(buffer, { failOn: 'none' }).rotate().png().toBuffer();
    } catch {
      const next = new Error(`Gambar OpenRouter image model berhasil dibuat, tetapi tidak bisa dibaca sebagai file gambar valid. ${error instanceof Error ? error.message : ''}`.trim());
      next.status = 502;
      next.upstream = 'openrouter';
      throw exposeAiError(next);
    }
  }
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
        safetyModel: aiConfig.safetyModel,
        safetyEnabled: aiConfig.safetyEnabled,
        generationQuality: aiConfig.generationQuality,
        imageSize: aiConfig.imageSize,
        reasoningEffort: aiConfig.reasoningEffort,
        backgroundMode: aiConfig.backgroundMode,
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

  const qualityAssessment = await assessImageQuality(uploadedBuffer, { forMode: 'ai_redraw' });

  if (process.env.LOGO_RESTORE_ENABLED !== '0') {
    const logoRestore = await logoRestoreBuffer(uploadedBuffer, settings, { qualityAssessment });
    if (logoRestore.canRestore) {
      return {
        imageBuffer: logoRestore.imageBuffer,
        metadata: {
          provider: logoRestore.metadata.provider,
          analysisModel: aiConfig.analysisModel,
          generationModel: logoRestore.metadata.generationModel,
          safetyModel: aiConfig.safetyModel,
          safetyEnabled: aiConfig.safetyEnabled,
          generationQuality: logoRestore.metadata.generationQuality,
          imageSize: aiConfig.imageSize,
          reasoningEffort: aiConfig.reasoningEffort,
          backgroundMode: aiConfig.backgroundMode,
          preset: aiConfig.preset,
          preprocess: aiConfig.preprocess,
          aspectPolicy: aiConfig.aspectPolicy,
          resolutionPolicy: aiConfig.resolutionPolicy,
          analysisSummary: {
            subjectSummary: 'Flat logo restored from source pixels without generative redraw.',
            style: 'Trace-first logo restoration',
            textDescription: 'Text/logo shapes are preserved from the uploaded artwork instead of reconstructed as OCR.',
            dominantColors: logoRestore.metadata.palette,
            backgroundPolicy: 'Edge-connected background was removed before vector tracing.',
            confidence: { overall: 0.86, text: 0.82, shapes: 0.86, colors: 0.9 },
            printNotes: ['AI redraw skipped because the input was detected as a flat logo/text artwork.']
          },
          logoRestore: logoRestore.metadata,
          technicalPrompt: 'Trace-first logo restore: preserve source shapes directly; AI image generation skipped for text/logo fidelity.',
          retryUsed: false,
          sourceAspectRatio: preprocessMeta.aspectRatio
        }
      };
    }
  }

  const preparedMeta = await prepareOpenRouterImageReferences(preprocessMeta);
  const safety = await checkOpenRouterSafety(preparedMeta, settings, aiConfig);
  const analysis = normalizeAnalysisPayload(
    {
      subjectSummary: 'Direct OpenRouter Gemini image-to-image redraw from the cleaned trace target.',
      style: 'Flat vector-like redraw',
      textDescription: 'Preserve exact readable text, placement, and hierarchy from the uploaded artwork.',
      backgroundPolicy: 'Remove camera/paper/table background and return isolated trace-ready artwork.',
      confidence: { overall: 0.82, text: 0.78, shapes: 0.82, colors: 0.82 },
      printNotes: [`Nemotron safety gate: ${safety.reason || 'safe'}`]
    },
    settings
  );
  const technicalPrompt = buildRedrawPrompt(settings, analysis);
  let generated = await generateWithOpenRouterImage(technicalPrompt, aiConfig, preparedMeta);
  let retryUsed = false;

  if (shouldRetryHybrid(aiConfig, analysis)) {
    generated = await generateWithOpenRouterImage(buildRetryPrompt(technicalPrompt, analysis), aiConfig, preparedMeta);
    retryUsed = true;
  }

  const cleanedOutput = await postprocessGeneratedImage(generated, aiConfig.preprocess);

  return {
    imageBuffer: cleanedOutput,
    metadata: {
      provider: aiConfig.provider,
      analysisModel: aiConfig.analysisModel,
      generationModel: aiConfig.generationModel,
      safetyModel: aiConfig.safetyModel,
      safetyEnabled: aiConfig.safetyEnabled,
      safetySummary: safety,
      generationQuality: aiConfig.generationQuality,
      imageSize: aiConfig.imageSize,
      reasoningEffort: aiConfig.reasoningEffort,
      backgroundMode: aiConfig.backgroundMode,
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
