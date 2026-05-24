import fs from 'fs-extra';
import path from 'node:path';
import { buildPrintLayout } from '../utils/paper.js';
import { createArtworkRegistrationMarks } from '../utils/registrationMarks.js';
import { escapeXml } from '../utils/svg.js';

export function buildSeparationSvg({ color, width, height, settings = {} }) {
  const layout = buildPrintLayout({
    sourceWidth: width,
    sourceHeight: height,
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
  const label = `FILM ${String(color.index).padStart(2, '0')} - ${color.hex}`;
  const paths = color.paths
    .map((d) => `<path d="${escapeXml(d)}" fill="#000000" fill-rule="evenodd"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.paperWidthMm}mm" height="${layout.paperHeightMm}mm" viewBox="0 0 ${layout.paperWidthMm} ${layout.paperHeightMm}" role="img" aria-label="${escapeXml(label)}">
${marks}
<g id="artwork" transform="translate(${layout.artworkX.toFixed(3)} ${layout.artworkY.toFixed(3)}) scale(${layout.scale.toFixed(8)})">
${paths}
</g>
<text x="${layout.artworkX.toFixed(3)}" y="${(layout.artworkY + layout.artworkHeightMm + 12).toFixed(3)}" fill="#000000" font-family="Arial, sans-serif" font-size="4">${escapeXml(label)}</text>
</svg>`;
}

export async function createSeparations({ pathsByColor, width, height, outputDir, settings = {} }) {
  await fs.ensureDir(outputDir);
  const separations = [];

  for (const color of pathsByColor) {
    const index = String(color.index).padStart(2, '0');
    const label = `FILM ${index} - ${color.hex}`;
    const svgPath = path.join(outputDir, `film-color-${index}.svg`);
    const pdfPath = path.join(outputDir, `film-color-${index}.pdf`);
    const previewPath = path.join(outputDir, `film-color-${index}-preview.png`);

    await fs.writeFile(svgPath, buildSeparationSvg({ color, width, height, settings }), 'utf8');
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
