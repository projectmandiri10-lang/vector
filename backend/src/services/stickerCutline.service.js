import fs from 'fs-extra';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createFilmPlan } from './separation.service.js';
import { traceMaskToPaths } from './vectorize.service.js';
import { buildPrintLayout } from '../utils/paper.js';
import { escapeXml } from '../utils/svg.js';

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

function isActiveMaskPixel(png, pixelIndex) {
  const idx = pixelIndex << 2;
  return png.data[idx + 3] >= 16 && png.data[idx] < 128 && png.data[idx + 1] < 128 && png.data[idx + 2] < 128;
}

function normalizeOffsetMm(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(20, Math.max(0.1, parsed));
}

function buildIntegralMask(active, width, height) {
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += active[width * y + x];
      integral[stride * (y + 1) + x + 1] = integral[stride * y + x + 1] + rowSum;
    }
  }

  return integral;
}

function hasActiveInRect(integral, width, x0, y0, x1, y1) {
  const stride = width + 1;
  const sum =
    integral[stride * y1 + x1] -
    integral[stride * y0 + x1] -
    integral[stride * y1 + x0] +
    integral[stride * y0 + x0];
  return sum > 0;
}

function dilateMask({ active, width, height, bounds, radiusPx }) {
  const integral = buildIntegralMask(active, width, height);
  const dilated = new PNG({ width, height, colorType: 6 });
  dilated.data.fill(255);

  const minX = Math.max(0, Math.floor(bounds.x - radiusPx));
  const minY = Math.max(0, Math.floor(bounds.y - radiusPx));
  const maxX = Math.min(width - 1, Math.ceil(bounds.maxX + radiusPx));
  const maxY = Math.min(height - 1, Math.ceil(bounds.maxY + radiusPx));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const x0 = Math.max(0, x - radiusPx);
      const y0 = Math.max(0, y - radiusPx);
      const x1 = Math.min(width, x + radiusPx + 1);
      const y1 = Math.min(height, y + radiusPx + 1);
      if (!hasActiveInRect(integral, width, x0, y0, x1, y1)) continue;

      const idx = (width * y + x) << 2;
      dilated.data[idx] = 0;
      dilated.data[idx + 1] = 0;
      dilated.data[idx + 2] = 0;
      dilated.data[idx + 3] = 255;
    }
  }

  return dilated;
}

async function buildUnionMask({ masks, printableIndexes, width, height }) {
  const active = new Uint8Array(width * height);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const mask of masks) {
    if (!printableIndexes.has(mask.index)) continue;
    const png = await readPng(mask.filePath);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = width * y + x;
        if (!isActiveMaskPixel(png, pixelIndex)) continue;
        active[pixelIndex] = 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!Number.isFinite(minX)) return null;
  return {
    active,
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
      maxX,
      maxY
    }
  };
}

function buildStickerCutlineSvg({ pathsByColor, cutlinePaths, filmPlan, width, height, settings, offsetMm }) {
  const artworkBounds = filmPlan.bounds;
  const layout = buildPrintLayout({
    sourceWidth: artworkBounds.width,
    sourceHeight: artworkBounds.height,
    actualWidthCm: settings.actualWidthCm,
    paperSize: settings.paperSize,
    paperOrientation: settings.paperOrientation
  });
  const transform = `translate(${layout.artworkX.toFixed(3)} ${layout.artworkY.toFixed(3)}) scale(${layout.scale.toFixed(8)}) translate(${(-artworkBounds.x).toFixed(3)} ${(-artworkBounds.y).toFixed(3)})`;
  const printableIndexes = new Set(filmPlan.colors.map((color) => color.index));
  const artworkPaths = pathsByColor
    .filter((color) => printableIndexes.has(color.index))
    .map((color) => {
      const paths = color.paths.map((d) => `<path d="${escapeXml(d)}" fill="${color.hex}" fill-rule="evenodd"/>`).join('\n');
      return `<g id="sticker-color-${String(color.index).padStart(2, '0')}" data-color="${color.hex}">\n${paths}\n</g>`;
    })
    .join('\n');
  const cutPaths = cutlinePaths
    .map(
      (d) =>
        `<path d="${escapeXml(d)}" fill="none" stroke="#FF00FF" stroke-width="0.25" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
    )
    .join('\n');
  const label = `Sticker cutline ${offsetMm} mm`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.paperWidthMm}mm" height="${layout.paperHeightMm}mm" viewBox="0 0 ${layout.paperWidthMm} ${layout.paperHeightMm}" role="img" aria-label="${escapeXml(label)}">
<g id="sticker-artwork" transform="${transform}">
${artworkPaths}
<g id="CutContour" data-spot-color="CutContour">
${cutPaths}
</g>
</g>
<text x="${layout.artworkX.toFixed(3)}" y="${(layout.artworkY + layout.artworkHeightMm + offsetMm + 12).toFixed(3)}" fill="#FF00FF" font-family="Arial, sans-serif" font-size="4">${escapeXml(label)}</text>
</svg>`;
}

export async function createStickerCutline({ masks, pathsByColor, width, height, outputDir, settings = {} }) {
  if (settings.productionType !== 'sticker' || settings.stickerCutlineEnabled !== true || pathsByColor.length === 0) {
    return null;
  }

  const filmPlan = createFilmPlan({
    pathsByColor,
    width,
    height,
    settings: { ...settings, includeBackgroundInFilmSize: false }
  });
  if (filmPlan.colors.length === 0) return null;

  const printableIndexes = new Set(filmPlan.colors.map((color) => color.index));
  const unionMask = await buildUnionMask({ masks, printableIndexes, width, height });
  if (!unionMask) return null;

  const offsetMm = normalizeOffsetMm(settings.stickerCutlineOffsetMm);
  const mmPerPixel = (settings.actualWidthCm * 10) / filmPlan.bounds.width;
  const radiusPx = Math.min(256, Math.max(1, Math.round(offsetMm / mmPerPixel)));
  const dilated = dilateMask({
    active: unionMask.active,
    width,
    height,
    bounds: unionMask.bounds,
    radiusPx
  });
  const maskPath = path.join(outputDir, 'sticker-cutline-mask.png');
  const svgPath = path.join(outputDir, 'sticker-cutline.svg');
  const pdfPath = path.join(outputDir, 'sticker-cutline.pdf');

  await writePng(dilated, maskPath);
  const cutlinePaths = await traceMaskToPaths(maskPath);
  if (cutlinePaths.length === 0) return null;

  await fs.writeFile(
    svgPath,
    buildStickerCutlineSvg({ pathsByColor, cutlinePaths, filmPlan, width, height, settings, offsetMm }),
    'utf8'
  );

  return {
    svgPath,
    pdfPath,
    maskPath,
    offsetMm,
    radiusPx,
    label: `Sticker cutline ${offsetMm} mm`
  };
}
