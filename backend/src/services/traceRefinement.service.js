import fs from 'fs-extra';
import path from 'node:path';
import sharp from 'sharp';

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

export function traceEdgeRefinementEnabled(settings = {}) {
  if (settings.edgeRefinement === false) return false;
  return process.env.TRACE_EDGE_REFINEMENT_ENABLED !== '0';
}

export async function refineTraceSourceImage(inputPath, outputPath, settings = {}) {
  if (!traceEdgeRefinementEnabled(settings)) {
    if (inputPath !== outputPath) await fs.copy(inputPath, outputPath);
    const metadata = await sharp(outputPath, { failOn: 'none' }).metadata();
    return {
      enabled: false,
      sourcePath: outputPath,
      width: metadata.width || 0,
      height: metadata.height || 0,
      scale: 1
    };
  }

  await fs.ensureDir(path.dirname(outputPath));
  const metadata = await sharp(inputPath, { failOn: 'error' }).metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Gagal membaca gambar untuk edge refinement.');
  }

  const requestedScale = numberFromEnv('TRACE_EDGE_SOURCE_SCALE', 2, 1, 4);
  const maxDimension = integerFromEnv('TRACE_EDGE_MAX_DIMENSION', 4096, 1024, 8192);
  const scale = Math.min(requestedScale, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const sharpenSigma = numberFromEnv('TRACE_EDGE_SHARPEN_SIGMA', 0.35, 0, 2);

  let pipeline = sharp(inputPath, { failOn: 'error' })
    .rotate()
    .ensureAlpha()
    .resize({
      width,
      height,
      fit: 'fill',
      kernel: 'lanczos3'
    })
    .median(1);

  if (process.env.TRACE_EDGE_NORMALIZE_LIGHTING === '1') {
    pipeline = pipeline.normalise({ lower: 1, upper: 99 });
  }

  if (sharpenSigma > 0) {
    pipeline = pipeline.sharpen({ sigma: sharpenSigma, m1: 0.35, m2: 0.45, x1: 2, y2: 8, y3: 14 });
  }

  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);

  return {
    enabled: true,
    sourcePath: outputPath,
    width,
    height,
    scale
  };
}
