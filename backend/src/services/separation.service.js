import fs from 'fs-extra';
import path from 'node:path';
import { buildPrintLayout } from '../utils/paper.js';
import { createArtworkRegistrationMarks } from '../utils/registrationMarks.js';
import { escapeXml } from '../utils/svg.js';

export function pathBounds(d) {
  const numbers = String(d).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  if (numbers.length < 2) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < numbers.length - 1; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    maxX,
    maxY
  };
}

export function mergeBounds(bounds) {
  const validBounds = bounds.filter(Boolean);
  if (validBounds.length === 0) return null;

  const minX = Math.min(...validBounds.map((box) => box.x));
  const minY = Math.min(...validBounds.map((box) => box.y));
  const maxX = Math.max(...validBounds.map((box) => box.maxX ?? box.x + box.width));
  const maxY = Math.max(...validBounds.map((box) => box.maxY ?? box.y + box.height));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    maxX,
    maxY
  };
}

function colorBounds(color) {
  return mergeBounds(color.paths.map((d) => pathBounds(d)));
}

export function fullCanvasBounds(width, height) {
  return {
    x: 0,
    y: 0,
    width,
    height,
    maxX: width,
    maxY: height
  };
}

function touchesCanvas(bounds, width, height) {
  const tolerance = 2;
  return bounds.x <= tolerance && bounds.y <= tolerance && bounds.maxX >= width - tolerance && bounds.maxY >= height - tolerance;
}

export function createFilmPlan({ pathsByColor, width, height, settings = {} }) {
  const fullBounds = fullCanvasBounds(width, height);
  const includeBackground = settings.includeBackgroundInFilmSize === true;
  const colors = pathsByColor
    .map((color) => ({
      ...color,
      bounds: colorBounds(color)
    }))
    .filter((color) => color.bounds);

  if (includeBackground) {
    return {
      colors,
      bounds: fullBounds,
      backgroundColor: null
    };
  }

  const backgroundColor = colors
    .filter((color) => touchesCanvas(color.bounds, width, height))
    .sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0];
  const printableColors = backgroundColor ? colors.filter((color) => color.index !== backgroundColor.index) : colors;
  const effectiveColors = printableColors.length > 0 ? printableColors : colors;

  return {
    colors: effectiveColors,
    bounds: mergeBounds(effectiveColors.map((color) => color.bounds)) || fullBounds,
    backgroundColor: backgroundColor || null
  };
}

export function buildSeparationSvg({ color, width, height, bounds, settings = {} }) {
  const artworkBounds = bounds || fullCanvasBounds(width, height);
  const layout = buildPrintLayout({
    sourceWidth: artworkBounds.width,
    sourceHeight: artworkBounds.height,
    actualWidthCm: settings.actualWidthCm,
    paperSize: settings.paperSize,
    paperOrientation: settings.paperOrientation
  });
  const marks = createArtworkRegistrationMarks({
    x: layout.artworkX,
    y: layout.artworkY,
    width: layout.artworkWidthMm,
    height: layout.artworkHeightMm
  });
  const label = color.label || `FILM ${String(color.index).padStart(2, '0')} - ${color.hex}`;
  const paths = color.paths
    .map((d) => `<path d="${escapeXml(d)}" fill="#000000" fill-rule="evenodd"/>`)
    .join('\n');
  const transform = `translate(${layout.artworkX.toFixed(3)} ${layout.artworkY.toFixed(3)}) scale(${layout.scale.toFixed(8)}) translate(${(-artworkBounds.x).toFixed(3)} ${(-artworkBounds.y).toFixed(3)})`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.paperWidthMm}mm" height="${layout.paperHeightMm}mm" viewBox="0 0 ${layout.paperWidthMm} ${layout.paperHeightMm}" role="img" aria-label="${escapeXml(label)}">
${marks}
<g id="artwork" transform="${transform}">
${paths}
</g>
<text x="${layout.artworkX.toFixed(3)}" y="${(layout.artworkY + layout.artworkHeightMm + 12).toFixed(3)}" fill="#000000" font-family="Arial, sans-serif" font-size="4">${escapeXml(label)}</text>
</svg>`;
}

export async function createSeparations({ pathsByColor, width, height, outputDir, settings = {} }) {
  await fs.ensureDir(outputDir);
  const separations = [];
  const filmPlan = createFilmPlan({ pathsByColor, width, height, settings });

  if (settings.createUnderbaseFilm === true && filmPlan.colors.length > 0) {
    const label = 'FILM DASAR - HITAM 100%';
    const svgPath = path.join(outputDir, 'film-underbase.svg');
    const pdfPath = path.join(outputDir, 'film-underbase.pdf');
    const previewPath = path.join(outputDir, 'film-underbase-preview.png');
    const underbaseColor = {
      index: 'underbase',
      kind: 'underbase',
      hex: '#000000',
      label,
      paths: filmPlan.colors.flatMap((color) => color.paths)
    };

    await fs.writeFile(svgPath, buildSeparationSvg({ color: underbaseColor, width, height, bounds: filmPlan.bounds, settings }), 'utf8');
    separations.push({
      index: 'underbase',
      kind: 'underbase',
      hex: '#000000',
      label,
      svgPath,
      pdfPath,
      previewPath
    });
  }

  for (const color of filmPlan.colors) {
    const index = String(color.index).padStart(2, '0');
    const label = `FILM ${index} - ${color.hex}`;
    const svgPath = path.join(outputDir, `film-color-${index}.svg`);
    const pdfPath = path.join(outputDir, `film-color-${index}.pdf`);
    const previewPath = path.join(outputDir, `film-color-${index}-preview.png`);

    await fs.writeFile(svgPath, buildSeparationSvg({ color, width, height, bounds: filmPlan.bounds, settings }), 'utf8');
    separations.push({
      index: color.index,
      hex: color.hex,
      label,
      svgPath,
      pdfPath,
      previewPath
    });
  }

  return separations;
}
