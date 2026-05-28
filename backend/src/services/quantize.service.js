import fs from 'fs-extra';
import path from 'node:path';
import { PNG } from 'pngjs';
import { canonicalizeSpotPixel, colorChroma, colorDistance, isNearWhite, nearestColorIndex, rgbToHex } from '../utils/colors.js';

async function readPng(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function onParsed() {
        resolve(this);
      })
      .on('error', reject);
  });
}

async function writePng(png, filePath) {
  await fs.ensureDir(path.dirname(filePath));
  return new Promise((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(filePath)).on('finish', resolve).on('error', reject);
  });
}

function isActiveMaskPixel(png, x, y) {
  const idx = (png.width * y + x) << 2;
  return png.data[idx + 3] >= 16 && png.data[idx] < 128 && png.data[idx + 1] < 128 && png.data[idx + 2] < 128;
}

function clearMaskPixel(png, pixelIndex) {
  const idx = pixelIndex << 2;
  png.data[idx] = 255;
  png.data[idx + 1] = 255;
  png.data[idx + 2] = 255;
  png.data[idx + 3] = 255;
}

function shouldRemoveMaskComponent(component) {
  if (component.count <= 24) return true;
  if (component.count <= 80 && (component.width <= 4 || component.height <= 4)) return true;
  return component.count <= 160 && (component.width <= 2 || component.height <= 2);
}

function shouldRemoveEdgeMaskComponent(component, color, width, height) {
  const totalPixels = Math.max(1, width * height);
  const coverage = component.count / totalPixels;
  const boundsCoverage = (component.width * component.height) / totalPixels;
  const lowChroma = colorChroma(color) <= 36;
  if (lowChroma) return true;
  return component.edgeCount >= 2 && (coverage >= 0.01 || boundsCoverage >= 0.22);
}

function shouldSearchEnclosedMaskBackground(component, color, width, height) {
  const totalPixels = Math.max(1, width * height);
  const coverage = component.count / totalPixels;
  const boundsCoverage = (component.width * component.height) / totalPixels;
  const lowChroma = colorChroma(color) <= 36;
  const broadEdgeBackground = component.edgeCount >= 2 && (coverage >= 0.01 || boundsCoverage >= 0.22);
  return broadEdgeBackground || (lowChroma && component.edgeCount >= 3 && boundsCoverage >= 0.18);
}

function cleanupEdgeBackgroundComponents(png, color, options = {}) {
  if (options.includeBackgroundInFilmSize === true) return false;

  const visited = new Uint8Array(png.width * png.height);
  const edgeStarts = [];
  let shouldSearchEnclosed = false;
  for (let x = 0; x < png.width; x += 1) {
    edgeStarts.push(x, png.width * (png.height - 1) + x);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    edgeStarts.push(png.width * y, png.width * y + png.width - 1);
  }

  for (const start of edgeStarts) {
    const startX = start % png.width;
    const startY = Math.floor(start / png.width);
    if (visited[start] || !isActiveMaskPixel(png, startX, startY)) continue;

    const stack = [start];
    const pixels = [];
    let count = 0;
    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;
    let touchesTop = false;
    let touchesRight = false;
    let touchesBottom = false;
    let touchesLeft = false;
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      const currentX = current % png.width;
      const currentY = Math.floor(current / png.width);
      pixels.push(current);
      count += 1;
      minX = Math.min(minX, currentX);
      maxX = Math.max(maxX, currentX);
      minY = Math.min(minY, currentY);
      maxY = Math.max(maxY, currentY);
      touchesTop ||= currentY === 0;
      touchesRight ||= currentX === png.width - 1;
      touchesBottom ||= currentY === png.height - 1;
      touchesLeft ||= currentX === 0;

      const neighbors = [
        [currentX - 1, currentY],
        [currentX + 1, currentY],
        [currentX, currentY - 1],
        [currentX, currentY + 1]
      ];
      for (const [nextX, nextY] of neighbors) {
        if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) continue;
        const next = png.width * nextY + nextX;
        if (visited[next] || !isActiveMaskPixel(png, nextX, nextY)) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    const component = {
      count,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      edgeCount: [touchesTop, touchesRight, touchesBottom, touchesLeft].filter(Boolean).length
    };
    if (shouldRemoveEdgeMaskComponent(component, color, png.width, png.height)) {
      pixels.forEach((pixel) => clearMaskPixel(png, pixel));
      shouldSearchEnclosed ||= shouldSearchEnclosedMaskBackground(component, color, png.width, png.height);
    }
  }

  return shouldSearchEnclosed;
}

function cleanupMaskNoise(png) {
  const visited = new Uint8Array(png.width * png.height);
  const maxStoredPixels = 160;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const start = png.width * y + x;
      if (visited[start] || !isActiveMaskPixel(png, x, y)) continue;

      const stack = [start];
      const pixels = [];
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      visited[start] = 1;

      while (stack.length > 0) {
        const current = stack.pop();
        const currentX = current % png.width;
        const currentY = Math.floor(current / png.width);
        count += 1;
        if (pixels.length < maxStoredPixels) pixels.push(current);
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1]
        ];

        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) continue;
          const next = png.width * nextY + nextX;
          if (visited[next] || !isActiveMaskPixel(png, nextX, nextY)) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      if (
        pixels.length === count &&
        shouldRemoveMaskComponent({
          count,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        })
      ) {
        pixels.forEach((pixel) => clearMaskPixel(png, pixel));
      }
    }
  }
}

function hasActiveArtworkNeighbor(masks, x, y, excludeMask) {
  return masks.some((mask) => mask !== excludeMask && isActiveMaskPixel(mask.png, x, y));
}

function cleanupEnclosedBackgroundMask(mask, masks) {
  const png = mask.png;
  const visited = new Uint8Array(png.width * png.height);

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const start = png.width * y + x;
      if (visited[start] || !isActiveMaskPixel(png, x, y)) continue;

      const stack = [start];
      const pixels = [];
      const adjacentSides = new Set();
      let touchesCanvasEdge = false;
      visited[start] = 1;

      while (stack.length > 0) {
        const current = stack.pop();
        const currentX = current % png.width;
        const currentY = Math.floor(current / png.width);
        pixels.push(current);
        touchesCanvasEdge ||= currentX === 0 || currentY === 0 || currentX === png.width - 1 || currentY === png.height - 1;

        const neighbors = [
          [currentX - 1, currentY, 'left'],
          [currentX + 1, currentY, 'right'],
          [currentX, currentY - 1, 'top'],
          [currentX, currentY + 1, 'bottom']
        ];
        for (const [nextX, nextY, side] of neighbors) {
          if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) continue;
          const next = png.width * nextY + nextX;
          if (isActiveMaskPixel(png, nextX, nextY)) {
            if (!visited[next]) {
              visited[next] = 1;
              stack.push(next);
            }
          } else if (hasActiveArtworkNeighbor(masks, nextX, nextY, mask)) {
            adjacentSides.add(side);
          }
        }
      }

      if (!touchesCanvasEdge && adjacentSides.size >= 3) {
        pixels.forEach((pixel) => clearMaskPixel(png, pixel));
      }
    }
  }
}

function mergeSimilarColors(colors, maxColors, mergeDistance = 42) {
  const merged = [];
  for (const color of colors) {
    const existing = merged.find((candidate) => colorDistance(candidate, color) < mergeDistance);
    if (existing) {
      const total = existing.count + color.count;
      existing.r = Math.round((existing.r * existing.count + color.r * color.count) / total);
      existing.g = Math.round((existing.g * existing.count + color.g * color.count) / total);
      existing.b = Math.round((existing.b * existing.count + color.b * color.count) / total);
      existing.count = total;
    } else {
      merged.push({ ...color });
    }
    merged.sort((a, b) => b.count - a.count);
    if (merged.length > maxColors * 3) merged.length = maxColors * 3;
  }

  return merged.sort((a, b) => b.count - a.count).slice(0, maxColors);
}

function dropTinySpotColors(colors, enabled) {
  if (!enabled || colors.length <= 3) return colors;
  const total = colors.reduce((sum, color) => sum + color.count, 0);
  const minPixels = Math.max(24, total * 0.001);
  const filtered = colors.filter((color) => color.count >= minPixels);
  return filtered.length >= 2 ? filtered : colors;
}

function normalizeMaxColors(value, fallback = 6) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(6, Math.max(2, parsed));
}

export async function quantizeImage(imagePath, options = {}) {
  const png = await readPng(imagePath);
  const histogram = new Map();
  const binSize = 24;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      const alpha = png.data[idx + 3];
      if (alpha < 16) continue;

      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      if (options.whiteAsBackground && isNearWhite({ r, g, b })) continue;

      const quantizedPixel = canonicalizeSpotPixel({ r, g, b }, options);
      const key = `${Math.floor(quantizedPixel.r / binSize)}-${Math.floor(quantizedPixel.g / binSize)}-${Math.floor(quantizedPixel.b / binSize)}`;
      const current = histogram.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      current.r += quantizedPixel.r;
      current.g += quantizedPixel.g;
      current.b += quantizedPixel.b;
      current.count += 1;
      histogram.set(key, current);
    }
  }

  const candidates = [...histogram.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  const useHardSpotColors = options.productionType === 'sablon' || options.separateColors === true;
  const maxColors = options.colorLimitMode === 'manual' || useHardSpotColors ? normalizeMaxColors(options.maxColors, 4) : 6;
  const mergeDistance = useHardSpotColors ? 150 : 42;
  const palette = dropTinySpotColors(mergeSimilarColors(candidates, maxColors, mergeDistance), useHardSpotColors).map((color, index) => ({
    index: index + 1,
    hex: rgbToHex(color),
    r: color.r,
    g: color.g,
    b: color.b,
    pixelCount: color.count
  }));

  if (palette.length === 0) {
    palette.push({ index: 1, hex: '#000000', r: 0, g: 0, b: 0, pixelCount: 0 });
  }

  return { width: png.width, height: png.height, palette };
}

export async function createMasksForPalette(imagePath, palette, outputDir, options = {}) {
  const source = await readPng(imagePath);
  await fs.ensureDir(outputDir);

  const masks = palette.map((color) => {
    const png = new PNG({ width: source.width, height: source.height, colorType: 6 });
    png.data.fill(255);
    return {
      ...color,
      width: source.width,
      height: source.height,
      filePath: path.join(outputDir, `color-${String(color.index).padStart(2, '0')}.png`),
      png
    };
  });

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const idx = (source.width * y + x) << 2;
      const alpha = source.data[idx + 3];
      if (alpha < 16) continue;

      const pixel = {
        r: source.data[idx],
        g: source.data[idx + 1],
        b: source.data[idx + 2]
      };
      if (options.whiteAsBackground && isNearWhite(pixel)) continue;

      const activeIndex = nearestColorIndex(canonicalizeSpotPixel(pixel, options), palette);
      const target = masks[activeIndex];
      target.png.data[idx] = 0;
      target.png.data[idx + 1] = 0;
      target.png.data[idx + 2] = 0;
      target.png.data[idx + 3] = 255;
    }
  }

  const masksWithEnclosedBackground = [];
  for (const mask of masks) {
    if (cleanupEdgeBackgroundComponents(mask.png, mask, options)) {
      masksWithEnclosedBackground.push(mask);
    }
    cleanupMaskNoise(mask.png);
  }

  for (const mask of masksWithEnclosedBackground) {
    cleanupEnclosedBackgroundMask(mask, masks);
    cleanupMaskNoise(mask.png);
  }

  for (const mask of masks) {
    await writePng(mask.png, mask.filePath);
    delete mask.png;
  }

  return masks;
}
