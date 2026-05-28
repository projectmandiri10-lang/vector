import fs from 'fs-extra';
import { optimize } from 'svgo';
import potrace from 'potrace';
import { escapeXml } from '../utils/svg.js';

function numberFromEnv(key, fallback, min, max) {
  const parsed = Number.parseFloat(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function traceOptions() {
  return {
    color: '#000000',
    background: 'transparent',
    threshold: numberFromEnv('TRACE_THRESHOLD', 180, 1, 254),
    turdSize: numberFromEnv('TRACE_TURD_SIZE', 4, 0, 100),
    optTolerance: numberFromEnv('TRACE_OPT_TOLERANCE', 0.18, 0.05, 1)
  };
}

function traceMask(filePath) {
  return new Promise((resolve, reject) => {
    potrace.trace(
      filePath,
      traceOptions(),
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
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Design Mudah vector artwork">
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
