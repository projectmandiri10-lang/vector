import sharp from 'sharp';
import { colorChroma, colorDistance, rgbToHex } from '../utils/colors.js';

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

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pixel(raw, index) {
  const offset = index * 4;
  return { r: raw[offset], g: raw[offset + 1], b: raw[offset + 2], a: raw[offset + 3] };
}

function luminance({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function estimateBorder(raw, width, height) {
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  for (let x = 0; x < width; x += step) {
    samples.push(pixel(raw, x));
    samples.push(pixel(raw, (height - 1) * width + x));
  }
  for (let y = 0; y < height; y += step) {
    samples.push(pixel(raw, y * width));
    samples.push(pixel(raw, y * width + width - 1));
  }
  const visible = samples.filter((sample) => sample.a >= 16);
  return {
    r: Math.round(average(visible.map((sample) => sample.r))),
    g: Math.round(average(visible.map((sample) => sample.g))),
    b: Math.round(average(visible.map((sample) => sample.b)))
  };
}

function estimateForeground(raw, width, height, background) {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const threshold = colorChroma(background) <= 42 ? 54 : 44;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = pixel(raw, index);
      if (current.a < 16) continue;
      if (colorDistance(current, background) < threshold) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) return { coverage: 0, boundsCoverage: 0, width: 0, height: 0 };
  const boundsWidth = maxX - minX + 1;
  const boundsHeight = maxY - minY + 1;
  return {
    coverage: count / Math.max(1, width * height),
    boundsCoverage: (boundsWidth * boundsHeight) / Math.max(1, width * height),
    width: boundsWidth,
    height: boundsHeight
  };
}

function estimateMetrics(raw, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) gray[i] = luminance(pixel(raw, i));

  let sum = 0;
  let sumSq = 0;
  let lapSumSq = 0;
  let neighborDiff = 0;
  let neighborCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = gray[index];
      sum += value;
      sumSq += value * value;
      if (x > 0) {
        neighborDiff += Math.abs(value - gray[index - 1]);
        neighborCount += 1;
      }
      if (y > 0) {
        neighborDiff += Math.abs(value - gray[index - width]);
        neighborCount += 1;
      }
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const laplace = gray[index - width] + gray[index - 1] + gray[index + 1] + gray[index + width] - 4 * value;
        lapSumSq += laplace * laplace;
      }
    }
  }

  const total = Math.max(1, width * height);
  const mean = sum / total;
  const contrast = Math.sqrt(Math.max(0, sumSq / total - mean * mean));
  const blurScore = lapSumSq / Math.max(1, (width - 2) * (height - 2));
  const noiseScore = neighborDiff / Math.max(1, neighborCount);
  return { contrast, blurScore, noiseScore };
}

export async function assessImageQuality(input, options = {}) {
  const metadata = await sharp(input, { failOn: 'error' }).metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;
  if (!sourceWidth || !sourceHeight) throw new Error('File gambar tidak valid atau tidak bisa dibaca.');

  const minLongestSide = integerFromEnv('READY_TRACE_MIN_LONGEST_SIDE', 600, 120, 2400);
  const idealLongestSide = integerFromEnv('READY_TRACE_IDEAL_LONGEST_SIDE', 1500, minLongestSide, 5000);
  const sampleMax = integerFromEnv('IMAGE_QUALITY_SAMPLE_MAX', 512, 128, 1024);
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: sampleMax, height: sampleMax, fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const background = estimateBorder(data, info.width, info.height);
  const foreground = estimateForeground(data, info.width, info.height, background);
  const metrics = estimateMetrics(data, info.width, info.height);
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const shortestSide = Math.min(sourceWidth, sourceHeight);
  const reasons = [];
  const warnings = [];

  if (longestSide < minLongestSide) reasons.push(`Resolusi terlalu kecil (${sourceWidth}x${sourceHeight}). Minimal sisi terpanjang ${minLongestSide}px.`);
  if (shortestSide < Math.max(160, minLongestSide * 0.35)) reasons.push(`Sisi pendek terlalu kecil (${shortestSide}px).`);
  if (foreground.coverage < 0.025) reasons.push('Area logo terlalu kecil atau tidak terbaca dari background.');
  if (metrics.contrast < numberFromEnv('READY_TRACE_MIN_CONTRAST', 18, 4, 80)) reasons.push('Kontras gambar terlalu rendah untuk Ready Trace tanpa AI.');
  if (metrics.blurScore < numberFromEnv('READY_TRACE_MIN_BLUR_SCORE', 22, 2, 400)) warnings.push('Gambar terdeteksi blur; hasil Ready Trace mungkin kurang presisi.');
  if (metrics.noiseScore > numberFromEnv('READY_TRACE_MAX_NOISE_SCORE', 42, 8, 120)) warnings.push('Gambar mengandung noise tinggi; warna kecil dapat dibersihkan otomatis.');
  if (longestSide < idealLongestSide) warnings.push(`Resolusi di bawah ideal ${idealLongestSide}px; gunakan foto lebih besar untuk hasil terbaik.`);

  const qualityStatus = reasons.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'pass';
  return {
    qualityStatus,
    sourceWidth,
    sourceHeight,
    longestSide,
    shortestSide,
    minLongestSide,
    idealLongestSide,
    foregroundCoverage: Number(foreground.coverage.toFixed(4)),
    foregroundBoundsCoverage: Number(foreground.boundsCoverage.toFixed(4)),
    foregroundWidth: foreground.width,
    foregroundHeight: foreground.height,
    blurScore: Number(metrics.blurScore.toFixed(2)),
    contrast: Number(metrics.contrast.toFixed(2)),
    noiseScore: Number(metrics.noiseScore.toFixed(2)),
    backgroundColor: rgbToHex(background),
    reasons,
    warnings,
    recommendedMode: qualityStatus === 'blocked' && options.forMode === 'ready_trace' ? 'ai_redraw' : options.forMode || 'ready_trace'
  };
}

export function readyTraceBlockedMessage(assessment) {
  const reason = assessment?.reasons?.[0] ? ` ${assessment.reasons[0]}` : '';
  return `Gambar terlalu kecil/blur untuk Ready Trace tanpa AI.${reason} Upload ulang dengan resolusi lebih tinggi atau gunakan AI Redraw Premium.`;
}
