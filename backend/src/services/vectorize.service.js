import fs from 'fs-extra';
import { optimize } from 'svgo';
import potrace from 'potrace';
import { escapeXml } from '../utils/svg.js';

function traceMask(filePath) {
  return new Promise((resolve, reject) => {
    potrace.trace(
      filePath,
      {
        color: '#000000',
        background: 'transparent',
        threshold: 180,
        turdSize: 8,
        optTolerance: 0.25
      },
      (error, svg) => {
        if (error) reject(error);
        else resolve(svg);
      }
    );
  });
}

function extractPaths(svg) {
  const paths = [];
  const regex = /<path[^>]*\sd="([^"]+)"[^>]*>/g;
  let match = regex.exec(svg);
  while (match) {
    paths.push(match[1]);
    match = regex.exec(svg);
  }
  return paths;
}

export async function traceMaskToPaths(filePath) {
  return extractPaths(await traceMask(filePath));
}

function optimizeSvg(svg) {
  return optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            mergePaths: false,
            convertPathData: false,
            cleanupIds: false
          }
        }
      }
    ]
  }).data;
}

export function buildFullColorSvg(pathsByColor, width, height) {
  const body = pathsByColor
    .map((color) => {
      const paths = color.paths
        .map((d) => `<path d="${escapeXml(d)}" fill="${color.hex}" fill-rule="evenodd"/>`)
        .join('\n');
      return `<g id="color-${String(color.index).padStart(2, '0')}" data-color="${color.hex}">\n${paths}\n</g>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI redraw vector">
${body}
</svg>`;
}

export async function vectorizeMasks(masks, options) {
  const pathsByColor = [];

  for (const mask of masks) {
    const paths = await traceMaskToPaths(mask.filePath);
    if (paths.length > 0) {
      pathsByColor.push({
        index: mask.index,
        hex: mask.hex,
        r: mask.r,
        g: mask.g,
        b: mask.b,
        paths
      });
    }
  }

  const svg = optimizeSvg(buildFullColorSvg(pathsByColor, options.width, options.height));
  await fs.writeFile(options.outputPath, svg, 'utf8');

  return { pathsByColor, svg };
}
