import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
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

function traceSmoothingEnabled() {
  return process.env.TRACE_SMOOTH_ENABLED !== '0';
}

async function prepareTraceMask(filePath) {
  if (!traceSmoothingEnabled()) return { filePath, cleanup: async () => {} };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-trace-mask-'));
  const smoothedPath = path.join(tempDir, 'mask.png');
  const sigma = numberFromEnv('TRACE_SMOOTH_SIGMA', 0.7, 0.1, 2);
  const threshold = numberFromEnv('TRACE_SMOOTH_THRESHOLD', 180, 1, 254);

  await sharp(filePath, { failOn: 'error' })
    .median(3)
    .blur(sigma)
    .threshold(threshold)
    .png()
    .toFile(smoothedPath);

  return {
    filePath: smoothedPath,
    cleanup: async () => fs.remove(tempDir)
  };
}

async function traceMask(filePath) {
  const prepared = await prepareTraceMask(filePath);
  try {
    return await new Promise((resolve, reject) => {
      potrace.trace(
        prepared.filePath,
        traceOptions(),
        (error, svg) => {
          if (error) reject(error);
          else resolve(svg);
        }
      );
    });
  } finally {
    await prepared.cleanup();
  }
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
