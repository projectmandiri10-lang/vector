import sharp from 'sharp';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createMasksForPalette, quantizeImage } from './quantize.service.js';
import { buildFullColorSvg, vectorizeMasks } from './vectorize.service.js';
import { createFilmPlan, createSeparations } from './separation.service.js';
import { createStickerCutline } from './stickerCutline.service.js';
import { refineTraceSourceImage } from './traceRefinement.service.js';
import { exportSvgToPdf, exportSvgToPng } from './export.service.js';
import { createResultZip, createSeparationZip } from './zip.service.js';
import { colorChroma, colorDistance, rgbToHex } from '../utils/colors.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function averageChannel({ r, g, b }) {
  return (r + g + b) / 3;
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

function estimateBorderColor(raw, width, height) {
  const border = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x < border || y < border || x >= width - border || y >= height - border;
      if (!isBorder) continue;
      const pixel = pixelAt(raw, y * width + x);
      if (pixel.a <= 16) continue;
      count += 1;
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
  }

  if (count === 0) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  };
}

function isBackgroundCandidate(raw, index, background) {
  const pixel = pixelAt(raw, index);
  if (pixel.a <= 16) return true;
  const distance = colorDistance(pixel, background);
  const backgroundIsDark = averageChannel(background) <= 80 && colorChroma(background) <= 44;
  if (distance <= (backgroundIsDark ? 58 : 44)) return true;
  if (backgroundIsDark && averageChannel(pixel) <= 96 && colorChroma(pixel) <= 52) return true;
  return distance <= 72 && colorChroma(pixel) <= 28;
}

function edgeConnectedBackground(raw, width, height, background) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const mask = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (!isBackgroundCandidate(raw, index, background)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return mask;
}

function foregroundBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, count, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function canonicalLogoPixel(pixel, settings = {}) {
  const avg = averageChannel(pixel);
  const chroma = colorChroma(pixel);
  if (chroma <= 34) {
    const whiteThreshold = strictSpotModeEnabled(settings) ? 118 : 150;
    return avg >= whiteThreshold ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  }
  if (settings.productionType === 'sablon' || settings.separateColors === true) {
    const isYellowInk =
      pixel.r > 150 && pixel.g > 120 && pixel.b < 110;
    const isYellowShadow =
      strictSpotModeEnabled(settings) &&
      pixel.r >= 88 &&
      pixel.g >= 70 &&
      pixel.b <= 125 &&
      pixel.r + pixel.g >= pixel.b * 2.7 &&
      pixel.r >= pixel.b + 35 &&
      pixel.g >= pixel.b + 28;
    if (isYellowInk || isYellowShadow) return { r: 255, g: 218, b: 0 };
  }
  return pixel;
}

function strictSpotModeEnabled(settings = {}) {
  if (settings.logoRestoreStrictSpots === false) return false;
  if (settings.strictSpotColors === false) return false;
  return process.env.LOGO_RESTORE_STRICT_SPOTS !== '0';
}

function colorSignature(color) {
  const channels = [
    ['r', color.r],
    ['g', color.g],
    ['b', color.b]
  ].sort((left, right) => right[1] - left[1]);
  return `${channels[0][0]}-${channels[2][0]}`;
}

function isDarkPrintableShadow(color) {
  return averageChannel(color) <= 122 && colorChroma(color) >= 36;
}

function isBrightPrintableSpot(color) {
  return averageChannel(color) >= 135 && colorChroma(color) >= 24;
}

function normalizePaletteIndex(colors) {
  return colors.map((color, index) => ({ ...color, index: index + 1 }));
}

function cleanStrictSpotPalette(colors, settings = {}) {
  if (!strictSpotModeEnabled(settings) || colors.length <= 2) {
    return { palette: normalizePaletteIndex(colors), removed: [], merged: [] };
  }

  const palette = colors.map((color) => ({ ...color }));
  const removed = [];
  const merged = [];
  const total = Math.max(1, palette.reduce((sum, color) => sum + color.count, 0));

  for (let index = palette.length - 1; index >= 0; index -= 1) {
    const color = palette[index];
    const ratio = color.count / total;
    const signature = colorSignature(color);
    const brighterSameHue = palette.find(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        colorSignature(candidate) === signature &&
        isBrightPrintableSpot(candidate) &&
        averageChannel(candidate) > averageChannel(color) + 36
    );

    if (brighterSameHue && (isDarkPrintableShadow(color) || ratio <= 0.08)) {
      brighterSameHue.count += color.count;
      merged.push({ from: rgbToHex(color), to: rgbToHex(brighterSameHue), pixelCount: color.count });
      palette.splice(index, 1);
      continue;
    }

    const tinyDarkSpot = ratio <= 0.012 && averageChannel(color) <= 132;
    if (tinyDarkSpot && palette.length > 2) {
      removed.push({ hex: rgbToHex(color), pixelCount: color.count });
      palette.splice(index, 1);
    }
  }

  return {
    palette: normalizePaletteIndex(palette.sort((a, b) => b.count - a.count)),
    removed,
    merged
  };
}

function buildPalette(raw, backgroundMask, width, height, settings = {}) {
  const histogram = new Map();
  const binSize = 28;

  for (let index = 0; index < width * height; index += 1) {
    if (backgroundMask[index]) continue;
    const pixel = canonicalLogoPixel(pixelAt(raw, index), settings);
    const key = `${Math.floor(pixel.r / binSize)}-${Math.floor(pixel.g / binSize)}-${Math.floor(pixel.b / binSize)}`;
    const current = histogram.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += pixel.r;
    current.g += pixel.g;
    current.b += pixel.b;
    current.count += 1;
    histogram.set(key, current);
  }

  const colors = [...histogram.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  const total = Math.max(1, colors.reduce((sum, color) => sum + color.count, 0));
  const filtered = colors.filter((color) => color.count / total >= 0.003).slice(0, 6);
  const palette = filtered.length > 0 ? filtered : [{ r: 255, g: 255, b: 255, count: 0 }];
  return cleanStrictSpotPalette(palette, settings);
}

function nearestColor(pixel, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const distance = colorDistance(pixel, color);
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

function isLogoLike({ width, height, bounds, palette, background }) {
  if (width < 96 || height < 96 || !bounds) return false;
  const coverage = bounds.count / Math.max(1, width * height);
  const backgroundIsLowChroma = colorChroma(background) <= 56;
  const hasHighContrast = palette.some((color) => colorDistance(color, background) >= 130);
  const hasFewSpotColors = palette.length <= 5;
  return backgroundIsLowChroma && hasHighContrast && hasFewSpotColors && coverage >= 0.035 && coverage <= 0.78;
}

function renderRestoredPng(raw, backgroundMask, palette, width, height, settings = {}) {
  const output = Buffer.alloc(width * height * 4);
  const dropDarkBackground =
    settings.removeBackground !== false && (settings.productionType === 'sablon' || settings.whiteAsBackground === true);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (backgroundMask[index]) {
      output[offset + 3] = 0;
      continue;
    }

    const pixel = canonicalLogoPixel(pixelAt(raw, index), settings);
    const color = nearestColor(pixel, palette);
    const isDark = averageChannel(color) <= 72 && colorChroma(color) <= 48;
    if (dropDarkBackground && isDark) {
      output[offset + 3] = 0;
      continue;
    }

    output[offset] = color.r;
    output[offset + 1] = color.g;
    output[offset + 2] = color.b;
    output[offset + 3] = 255;
  }

  return output;
}

export async function logoRestoreBuffer(uploadedBuffer, settings = {}, options = {}) {
  const maxDimension = Math.min(3072, Math.max(1024, Number.parseInt(process.env.PREPROCESS_MAX_DIMENSION || '2048', 10)));
  const normalized = await sharp(uploadedBuffer, { failOn: 'error' })
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const source = sharp(normalized).ensureAlpha();
  const metadata = await source.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) throw new Error('File gambar tidak valid atau tidak bisa dibaca.');
  const qualityAssessment = options.qualityAssessment || null;
  if (qualityAssessment?.qualityStatus === 'blocked') {
    return {
      canRestore: false,
      metadata: {
        provider: 'logo_restore_trace_first',
        reason: 'quality_blocked',
        qualityAssessment,
        strictSpotColors: strictSpotModeEnabled(settings)
      }
    };
  }

  const { data: raw } = await source.raw().toBuffer({ resolveWithObject: true });
  const background = estimateBorderColor(raw, width, height);
  const backgroundMask = edgeConnectedBackground(raw, width, height, background);
  const bounds = foregroundBounds(backgroundMask, width, height);
  const paletteResult = buildPalette(raw, backgroundMask, width, height, settings);
  const palette = paletteResult.palette;
  const canRestore =
    options.force === true ||
    (isLogoLike({ width, height, bounds, palette, background }) &&
      (qualityAssessment?.noiseScore === undefined || qualityAssessment.noiseScore <= Number.parseFloat(process.env.LOGO_RESTORE_MAX_NOISE_SCORE || '42')));
  if (!canRestore) {
    return {
      canRestore: false,
      metadata: {
        provider: 'logo_restore_trace_first',
        reason: 'not_logo_like',
        backgroundColor: rgbToHex(background),
        palette: palette.map((color) => ({ hex: rgbToHex(color), pixelCount: color.count })),
        strictSpotColors: strictSpotModeEnabled(settings),
        removedSpotColors: paletteResult.removed,
        mergedSpotColors: paletteResult.merged
      }
    };
  }

  const restoredRaw = renderRestoredPng(raw, backgroundMask, palette, width, height, settings);
  let image = sharp(restoredRaw, { raw: { width, height, channels: 4 } });
  let outputWidth = width;
  let outputHeight = height;
  let crop = null;
  if (bounds) {
    const padding = Math.max(8, Math.round(Math.min(width, height) * 0.025));
    const left = clamp(bounds.minX - padding, 0, width - 1);
    const top = clamp(bounds.minY - padding, 0, height - 1);
    const cropWidth = clamp(bounds.width + padding * 2, 1, width - left);
    const cropHeight = clamp(bounds.height + padding * 2, 1, height - top);
    crop = { left, top, width: cropWidth, height: cropHeight };
    outputWidth = cropWidth;
    outputHeight = cropHeight;
    image = image.extract(crop);
  }

  const imageBuffer = await image.png({ compressionLevel: 9 }).toBuffer();
  return {
    canRestore: true,
    imageBuffer,
    metadata: {
      provider: 'logo_restore_trace_first',
      reason: 'flat_logo_detected',
      generationModel: 'none',
      generationQuality: 'trace_first',
      backgroundColor: rgbToHex(background),
      palette: palette.map((color) => ({ hex: rgbToHex(color), pixelCount: color.count })),
      strictSpotColors: strictSpotModeEnabled(settings),
      removedSpotColors: paletteResult.removed,
      mergedSpotColors: paletteResult.merged,
      crop,
      width: outputWidth,
      height: outputHeight
    }
  };
}

function artifactFile(buffer, filename, mimeType) {
  return {
    filename,
    mimeType,
    base64: buffer.toString('base64')
  };
}

async function artifactIfExists(filePath, filename, mimeType) {
  if (!(await fs.pathExists(filePath))) return null;
  return artifactFile(await fs.readFile(filePath), filename, mimeType);
}

async function buildArtifactResponse(jobDir, settings, manifest, palette, separations, stickerCutline) {
  const artifacts = {
    fullPng: await artifactIfExists(path.join(jobDir, 'preview-full-color.png'), 'preview-full-color.png', 'image/png'),
    fullSvg: await artifactIfExists(path.join(jobDir, 'full-vector.svg'), 'full-vector.svg', 'image/svg+xml'),
    fullPdf: await artifactIfExists(path.join(jobDir, 'full-vector.pdf'), 'full-vector.pdf', 'application/pdf'),
    stickerCutlineSvg: await artifactIfExists(path.join(jobDir, 'sticker-cutline.svg'), 'sticker-cutline.svg', 'image/svg+xml'),
    stickerCutlinePdf: await artifactIfExists(path.join(jobDir, 'sticker-cutline.pdf'), 'sticker-cutline.pdf', 'application/pdf'),
    zip: await artifactIfExists(path.join(jobDir, 'result.zip'), 'result.zip', 'application/zip'),
    separationZip: await artifactIfExists(path.join(jobDir, 'separation-films.zip'), 'separation-films.zip', 'application/zip'),
    separations: []
  };

  for (const film of separations) {
    artifacts.separations.push({
      index: film.index,
      kind: film.kind || 'color',
      hex: film.hex,
      label: film.label,
      svg: await artifactIfExists(film.svgPath, path.basename(film.svgPath), 'image/svg+xml'),
      pdf: await artifactIfExists(film.pdfPath, path.basename(film.pdfPath), 'application/pdf'),
      preview: await artifactIfExists(film.previewPath, path.basename(film.previewPath), 'image/png')
    });
  }

  return {
    mode: 'logo_restore_artifacts',
    status: 'done',
    message: 'Logo restore selesai diproses backend dengan Potrace smoothing.',
    settings,
    palette,
    separationFilmCount: separations.length,
    manifest,
    artifacts,
    stickerCutline: stickerCutline
      ? {
          offsetMm: stickerCutline.offsetMm,
          radiusPx: stickerCutline.radiusPx,
          label: stickerCutline.label
        }
      : null
  };
}

export async function createTraceArtifactsFromImage({ imageBuffer, settings = {}, metadata = {} }) {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-logo-restore-'));
  try {
    const rawSourcePath = path.join(jobDir, 'trace-source-original.png');
    const sourcePath = path.join(jobDir, 'trace-source.png');
    const fullPreviewPath = path.join(jobDir, 'preview-full-color.png');
    const fullSvgPath = path.join(jobDir, 'full-vector.svg');
    const fullPdfPath = path.join(jobDir, 'full-vector.pdf');

    const effectiveSettings = {
      ...settings,
      makeVector: true,
      colorLimitMode: settings.colorLimitMode || 'manual',
      maxColors: settings.maxColors || 4,
      removeBackground: settings.removeBackground !== false,
      edgeRefinement: settings.edgeRefinement !== false,
      curveCleanup: settings.curveCleanup !== false && metadata.strictSpotColors !== false,
      qualityAssessment: metadata.qualityAssessment || settings.qualityAssessment || null
    };
    await fs.writeFile(rawSourcePath, imageBuffer);
    const refinement = await refineTraceSourceImage(rawSourcePath, sourcePath, effectiveSettings);
    const sourceMeta = await sharp(sourcePath, { failOn: 'error' }).metadata();
    await fs.copy(sourcePath, fullPreviewPath);

    const quantized = await quantizeImage(sourcePath, effectiveSettings);
    const palette = quantized.palette;
    await fs.writeJson(path.join(jobDir, 'palette.json'), palette, { spaces: 2 });

    const masks = await createMasksForPalette(sourcePath, palette, path.join(jobDir, 'masks'), effectiveSettings);
    const vectorResult = await vectorizeMasks(masks, {
      width: quantized.width,
      height: quantized.height,
      outputPath: fullSvgPath,
      curveCleanup: effectiveSettings.curveCleanup === true,
      edgeRefinement: effectiveSettings.edgeRefinement === true
    });
    let pathsByColor = vectorResult.pathsByColor;

    if (effectiveSettings.removeBackground === true) {
      const filmPlan = createFilmPlan({
        pathsByColor,
        width: quantized.width,
        height: quantized.height,
        settings: effectiveSettings
      });
      pathsByColor = filmPlan.colors;
      await fs.writeFile(fullSvgPath, buildFullColorSvg(pathsByColor, quantized.width, quantized.height), 'utf8');
    }

    await exportSvgToPdf(fullSvgPath, fullPdfPath);

    const stickerCutline = await createStickerCutline({
      masks,
      pathsByColor,
      width: quantized.width,
      height: quantized.height,
      outputDir: jobDir,
      settings: effectiveSettings
    });
    if (stickerCutline) {
      await exportSvgToPdf(stickerCutline.svgPath, stickerCutline.pdfPath);
    }

    let separations = [];
    if (effectiveSettings.separateColors && pathsByColor.length > 0) {
      separations = await createSeparations({
        pathsByColor,
        width: quantized.width,
        height: quantized.height,
        outputDir: path.join(jobDir, 'separations'),
        settings: effectiveSettings
      });
      for (const film of separations) {
        await exportSvgToPdf(film.svgPath, film.pdfPath);
        await exportSvgToPng(film.svgPath, film.previewPath);
      }
    }

    await createResultZip(jobDir, path.join(jobDir, 'result.zip'));
    if (separations.length > 0) {
      await createSeparationZip(path.join(jobDir, 'separations'), path.join(jobDir, 'separation-films.zip'));
    }

    return await buildArtifactResponse(
      jobDir,
      effectiveSettings,
      {
        width: sourceMeta.width || quantized.width,
        height: sourceMeta.height || quantized.height,
        palette,
        aiRedraw:
          metadata?.readyTraceProvider || metadata?.provider === 'ready_trace_edge_refinement'
            ? null
            : { ...metadata, artifactsGenerated: true },
        readyTrace:
          metadata?.readyTraceProvider || metadata?.provider === 'ready_trace_edge_refinement'
            ? { ...metadata, artifactsGenerated: true }
            : null,
        traceRefinement: refinement,
        generatedFiles: [
          'preview-full-color.png',
          'full-vector.svg',
          'full-vector.pdf',
          stickerCutline ? 'sticker-cutline.svg' : null,
          stickerCutline ? 'sticker-cutline.pdf' : null,
          separations.length > 0 ? 'separation-films.zip' : null,
          'result.zip'
        ].filter(Boolean)
      },
      palette,
      separations,
      stickerCutline
    );
  } finally {
    await fs.remove(jobDir);
  }
}

export async function createLogoRestoreArtifacts({ imageBuffer, settings = {}, metadata = {} }) {
  return createTraceArtifactsFromImage({ imageBuffer, settings, metadata });
}
