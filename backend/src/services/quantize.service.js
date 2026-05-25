import fs from 'fs-extra';
import path from 'node:path';
import { PNG } from 'pngjs';
import { colorDistance, isNearWhite, nearestColorIndex, rgbToHex } from '../utils/colors.js';

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

function mergeSimilarColors(colors, maxColors) {
  const merged = [];
  for (const color of colors) {
    const existing = merged.find((candidate) => colorDistance(candidate, color) < 42);
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

      const key = `${Math.floor(r / binSize)}-${Math.floor(g / binSize)}-${Math.floor(b / binSize)}`;
      const current = histogram.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      current.r += r;
      current.g += g;
      current.b += b;
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

  const maxColors = Math.min(6, Math.max(2, options.maxColors || 4));
  const palette = mergeSimilarColors(candidates, maxColors).map((color, index) => ({
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

      const activeIndex = nearestColorIndex(pixel, palette);
      const target = masks[activeIndex];
      target.png.data[idx] = 0;
      target.png.data[idx + 1] = 0;
      target.png.data[idx + 2] = 0;
      target.png.data[idx + 3] = 255;
    }
  }

  for (const mask of masks) {
    cleanupMaskNoise(mask.png);
    await writePng(mask.png, mask.filePath);
    delete mask.png;
  }

  return masks;
}
