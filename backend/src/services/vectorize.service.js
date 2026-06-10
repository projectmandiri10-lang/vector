import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';
import potrace from 'potrace';
import { PNG } from 'pngjs';
import { escapeXml } from '../utils/svg.js';

function numberFromEnv(key, fallback, min, max) {
  const parsed = Number.parseFloat(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function integerFromEnv(key, fallback, min, max) {
  const parsed = Number.parseInt(process.env[key], 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function traceCurveCleanupEnabled(options = {}) {
  if (options.edgeRefinement === false) return false;
  if (options.curveCleanup === false) return false;
  return (options.curveCleanup === true || options.edgeRefinement === true) && process.env.TRACE_CURVE_CLEANUP_ENABLED !== '0';
}

function traceOptions(options = {}) {
  const cleanup = traceCurveCleanupEnabled(options);
  return {
    color: '#000000',
    background: 'transparent',
    threshold: numberFromEnv('TRACE_THRESHOLD', 180, 1, 254),
    turdSize: cleanup ? numberFromEnv('TRACE_CURVE_TURD_SIZE', 12, 0, 100) : numberFromEnv('TRACE_TURD_SIZE', 4, 0, 100),
    alphaMax: cleanup ? numberFromEnv('TRACE_CURVE_ALPHA_MAX', 1.25, 0, 2) : numberFromEnv('TRACE_ALPHA_MAX', 1, 0, 2),
    optCurve: true,
    optTolerance: cleanup ? numberFromEnv('TRACE_CURVE_OPT_TOLERANCE', 0.32, 0.05, 1) : numberFromEnv('TRACE_OPT_TOLERANCE', 0.18, 0.05, 1)
  };
}

function traceSmoothingEnabled() {
  return process.env.TRACE_SMOOTH_ENABLED !== '0';
}

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

function activeMaskPixels(png) {
  const mask = new Uint8Array(png.width * png.height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index << 2;
    mask[index] = png.data[offset + 3] >= 16 && png.data[offset] < 128 && png.data[offset + 1] < 128 && png.data[offset + 2] < 128 ? 1 : 0;
  }
  return mask;
}

function morphMask(mask, width, height, radius, mode) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === 'dilate' ? 0 : 1;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          const active = nextX >= 0 && nextY >= 0 && nextX < width && nextY < height ? mask[nextY * width + nextX] : 0;
          if (mode === 'dilate') {
            value ||= active;
          } else {
            value &&= active;
          }
        }
      }
      output[y * width + x] = value ? 1 : 0;
    }
  }
  return output;
}

function findMaskComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || !mask[start]) continue;

    const stack = [start];
    const pixels = [];
    let count = 0;
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      pixels.push(current);
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ];
      for (const [nextX, nextY] of neighbors) {
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (visited[next] || !mask[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    components.push({
      pixels,
      count,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      boundsArea: (maxX - minX + 1) * (maxY - minY + 1)
    });
  }

  return components;
}

function shouldDropTraceComponent(component, totalPixels) {
  const minPixels = integerFromEnv('TRACE_EDGE_MIN_COMPONENT_PIXELS', 10, 0, 1000);
  if (component.count <= minPixels) return true;
  if (component.count <= 48 && (component.width <= 3 || component.height <= 3)) return true;
  return component.count / Math.max(1, totalPixels) < numberFromEnv('TRACE_EDGE_MIN_COMPONENT_RATIO', 0.000012, 0, 0.01);
}

function cleanupComponentMask(componentMask, width, height, radius, iterations, allowOpen) {
  let output = componentMask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    output = morphMask(output, width, height, radius, 'dilate');
    output = morphMask(output, width, height, radius, 'erode');
    if (allowOpen) {
      output = morphMask(output, width, height, radius, 'erode');
      output = morphMask(output, width, height, radius, 'dilate');
    }
  }
  return output;
}

function refineMaskByComponent(mask, width, height) {
  const totalPixels = Math.max(1, width * height);
  const components = findMaskComponents(mask, width, height);
  const output = new Uint8Array(mask.length);
  const baseRadius = integerFromEnv('TRACE_CURVE_MORPH_RADIUS', 1, 1, 3);
  const baseIterations = integerFromEnv('TRACE_CURVE_MORPH_ITERATIONS', 1, 1, 3);
  const largeRatio = numberFromEnv('TRACE_EDGE_LARGE_COMPONENT_RATIO', 0.025, 0.001, 0.5);
  const mediumRatio = numberFromEnv('TRACE_EDGE_MEDIUM_COMPONENT_RATIO', 0.004, 0.0001, 0.25);

  for (const component of components) {
    if (shouldDropTraceComponent(component, totalPixels)) continue;

    const coverage = component.count / totalPixels;
    const boundsCoverage = component.boundsArea / totalPixels;
    const isLarge = coverage >= largeRatio || boundsCoverage >= largeRatio * 2.2;
    const isMedium = coverage >= mediumRatio || boundsCoverage >= mediumRatio * 2.5;
    const radius = isLarge || isMedium ? baseRadius : 1;
    const iterations = isLarge ? baseIterations : 1;
    const allowOpen = isLarge || isMedium;
    const componentMask = new Uint8Array(mask.length);
    component.pixels.forEach((pixel) => {
      componentMask[pixel] = 1;
    });

    const cleaned = cleanupComponentMask(componentMask, width, height, radius, iterations, allowOpen);
    for (let index = 0; index < cleaned.length; index += 1) {
      if (cleaned[index]) output[index] = 1;
    }
  }

  return output;
}

function writeMaskToPng(mask, width, height) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index << 2;
    const value = mask[index] ? 0 : 255;
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
    png.data[offset + 3] = 255;
  }
  return png;
}

async function cleanupCurveMask(filePath, outputPath, options = {}) {
  const png = await readPng(filePath);
  const mask = refineMaskByComponent(activeMaskPixels(png), png.width, png.height);

  await writePng(writeMaskToPng(mask, png.width, png.height), outputPath);
}

async function prepareTraceMask(filePath, options = {}) {
  if (!traceSmoothingEnabled() && !traceCurveCleanupEnabled(options)) return { filePath, cleanup: async () => {} };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectorizer-trace-mask-'));
  const cleanupPath = path.join(tempDir, 'curve-cleanup.png');
  const smoothedPath = path.join(tempDir, 'mask.png');
  const shouldCleanupCurves = traceCurveCleanupEnabled(options);
  const traceSourcePath = shouldCleanupCurves ? cleanupPath : filePath;
  const resampleScale = shouldCleanupCurves ? numberFromEnv('TRACE_CURVE_RESAMPLE_SCALE', 0.65, 0.35, 1) : 1;
  const sigma = shouldCleanupCurves ? numberFromEnv('TRACE_CURVE_SMOOTH_SIGMA', 0.85, 0.1, 2) : numberFromEnv('TRACE_SMOOTH_SIGMA', 0.7, 0.1, 2);
  const threshold = shouldCleanupCurves
    ? numberFromEnv('TRACE_CURVE_SMOOTH_THRESHOLD', 180, 1, 254)
    : numberFromEnv('TRACE_SMOOTH_THRESHOLD', 180, 1, 254);

  if (shouldCleanupCurves) {
    await cleanupCurveMask(filePath, cleanupPath, options);
  }

  let pipeline = sharp(traceSourcePath, { failOn: 'error' });
  if (resampleScale < 1) {
    const metadata = await pipeline.metadata();
    const width = Math.max(1, metadata.width || 1);
    const height = Math.max(1, metadata.height || 1);
    pipeline = pipeline
      .resize({
        width: Math.max(1, Math.round(width * resampleScale)),
        height: Math.max(1, Math.round(height * resampleScale)),
        fit: 'fill',
        kernel: 'lanczos3'
      })
      .resize({ width, height, fit: 'fill', kernel: 'lanczos3' });
  }

  await pipeline.median(3).blur(sigma).threshold(threshold).png().toFile(smoothedPath);

  return {
    filePath: smoothedPath,
    cleanup: async () => fs.remove(tempDir)
  };
}

async function traceMask(filePath, options = {}) {
  const prepared = await prepareTraceMask(filePath, options);
  try {
    return await new Promise((resolve, reject) => {
      potrace.trace(
        prepared.filePath,
        traceOptions(options),
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

function formatPathNumber(value, precision) {
  const rounded = Number.parseFloat(value).toFixed(precision);
  return rounded
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/^-0$/, '0');
}

function roundPathData(pathData, options = {}) {
  if (!traceCurveCleanupEnabled(options)) return pathData;
  const precision = integerFromEnv('TRACE_CURVE_FLOAT_PRECISION', 1, 0, 4);
  return pathData.replace(/-?\d+\.\d+/g, (value) => formatPathNumber(value, precision));
}

export async function traceMaskToPaths(filePath, options = {}) {
  return extractPaths(await traceMask(filePath, options));
}

function optimizeSvg(svg, options = {}) {
  const cleanup = traceCurveCleanupEnabled(options);
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
      },
      ...(cleanup
        ? [
            {
              name: 'convertPathData',
              params: {
                floatPrecision: integerFromEnv('TRACE_CURVE_FLOAT_PRECISION', 1, 0, 4),
                transformPrecision: integerFromEnv('TRACE_CURVE_FLOAT_PRECISION', 1, 0, 4),
                noSpaceAfterFlags: false
              }
            }
          ]
        : [])
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
    const paths = (await traceMaskToPaths(mask.filePath, options)).map((pathData) => roundPathData(pathData, options));
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

  const svg = optimizeSvg(buildFullColorSvg(pathsByColor, options.width, options.height), options);
  await fs.writeFile(options.outputPath, svg, 'utf8');

  return { pathsByColor, svg };
}
