import sharp from 'sharp';
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
    return avg >= 150 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  }
  if (settings.productionType === 'sablon' || settings.separateColors === true) {
    if (pixel.r > 150 && pixel.g > 120 && pixel.b < 110) return { r: 255, g: 218, b: 0 };
  }
  return pixel;
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
  return filtered.length > 0 ? filtered : [{ r: 255, g: 255, b: 255, count: 0 }];
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

  const { data: raw } = await source.raw().toBuffer({ resolveWithObject: true });
  const background = estimateBorderColor(raw, width, height);
  const backgroundMask = edgeConnectedBackground(raw, width, height, background);
  const bounds = foregroundBounds(backgroundMask, width, height);
  const palette = buildPalette(raw, backgroundMask, width, height, settings);
  const canRestore = options.force === true || isLogoLike({ width, height, bounds, palette, background });
  if (!canRestore) {
    return {
      canRestore: false,
      metadata: {
        provider: 'logo_restore_trace_first',
        reason: 'not_logo_like',
        backgroundColor: rgbToHex(background),
        palette: palette.map((color) => ({ hex: rgbToHex(color), pixelCount: color.count }))
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
      crop,
      width: outputWidth,
      height: outputHeight
    }
  };
}
