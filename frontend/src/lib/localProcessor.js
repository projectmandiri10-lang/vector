import { INPUT_MODE_RETOUCH } from './modes.js';
import { calculateJobPrice } from './pricing.js';

const MAX_CANVAS_EDGE = 720;
const BIN_SIZE = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function isNearWhite({ r, g, b }) {
  return r >= 242 && g >= 242 && b >= 242;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = reject;
    image.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
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

function buildPalette(imageData, settings) {
  const histogram = new Map();
  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (alpha < 16) continue;
    const pixel = {
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2]
    };
    if (settings.whiteAsBackground && isNearWhite(pixel)) continue;
    const key = `${Math.floor(pixel.r / BIN_SIZE)}-${Math.floor(pixel.g / BIN_SIZE)}-${Math.floor(pixel.b / BIN_SIZE)}`;
    const current = histogram.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += pixel.r;
    current.g += pixel.g;
    current.b += pixel.b;
    current.count += 1;
    histogram.set(key, current);
  }

  const maxColors = settings.colorLimitMode === 'manual' ? clamp(Number.parseInt(settings.maxColors || 4, 10), 2, 6) : 6;
  const candidates = [...histogram.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  const palette = mergeSimilarColors(candidates, maxColors).map((color, index) => ({
    index: index + 1,
    hex: rgbToHex(color),
    r: color.r,
    g: color.g,
    b: color.b,
    pixelCount: color.count
  }));

  return palette.length > 0 ? palette : [{ index: 1, hex: '#000000', r: 0, g: 0, b: 0, pixelCount: 0 }];
}

function nearestColorIndex(pixel, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((color, index) => {
    const distance = colorDistance(pixel, color);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function assignPixels(imageData, palette, settings) {
  const assignments = new Int16Array(imageData.width * imageData.height);
  assignments.fill(-1);
  const colors = palette.map((color) => ({
    ...color,
    count: 0,
    touchesTop: false,
    touchesRight: false,
    touchesBottom: false,
    touchesLeft: false,
    bounds: { x: imageData.width, y: imageData.height, maxX: 0, maxY: 0, width: 0, height: 0 }
  }));

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const offset = (imageData.width * y + x) << 2;
      const alpha = imageData.data[offset + 3];
      if (alpha < 16) continue;
      const pixel = {
        r: imageData.data[offset],
        g: imageData.data[offset + 1],
        b: imageData.data[offset + 2]
      };
      if (settings.whiteAsBackground && isNearWhite(pixel)) continue;
      const colorIndex = nearestColorIndex(pixel, palette);
      assignments[imageData.width * y + x] = colorIndex;
      const color = colors[colorIndex];
      color.count += 1;
      color.touchesTop ||= y === 0;
      color.touchesRight ||= x === imageData.width - 1;
      color.touchesBottom ||= y === imageData.height - 1;
      color.touchesLeft ||= x === 0;
      color.bounds.x = Math.min(color.bounds.x, x);
      color.bounds.y = Math.min(color.bounds.y, y);
      color.bounds.maxX = Math.max(color.bounds.maxX, x + 1);
      color.bounds.maxY = Math.max(color.bounds.maxY, y + 1);
    }
  }

  colors.forEach((color) => {
    if (color.count <= 0) return;
    color.bounds.width = Math.max(1, color.bounds.maxX - color.bounds.x);
    color.bounds.height = Math.max(1, color.bounds.maxY - color.bounds.y);
  });

  return { assignments, colors: colors.filter((color) => color.count > 0) };
}

function mergeBounds(colors, width, height) {
  if (colors.length === 0) {
    return { x: 0, y: 0, maxX: width, maxY: height, width, height };
  }
  const x = Math.min(...colors.map((color) => color.bounds.x));
  const y = Math.min(...colors.map((color) => color.bounds.y));
  const maxX = Math.max(...colors.map((color) => color.bounds.maxX));
  const maxY = Math.max(...colors.map((color) => color.bounds.maxY));
  return { x, y, maxX, maxY, width: Math.max(1, maxX - x), height: Math.max(1, maxY - y) };
}

function printableColors(colors, settings, width, height) {
  if (settings.includeBackgroundInFilmSize) return colors;
  const background = [...colors]
    .filter((color) => color.touchesTop && color.touchesRight && color.touchesBottom && color.touchesLeft)
    .sort((a, b) => b.count - a.count)[0];
  const filtered = background ? colors.filter((color) => color.index !== background.index) : colors;
  return filtered.length > 0 ? filtered : colors;
}

function rowRunPath(assignments, width, height, activeIndexes) {
  const active = activeIndexes instanceof Set ? activeIndexes : new Set([activeIndexes]);
  const commands = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      while (x < width && !active.has(assignments[width * y + x])) x += 1;
      const start = x;
      while (x < width && active.has(assignments[width * y + x])) x += 1;
      if (x > start) commands.push(`M${start} ${y}H${x}V${y + 1}H${start}Z`);
    }
  }
  return commands.join('');
}

function binaryFromAssignments(assignments, width, height, colors) {
  const activeIndexes = new Set(colors.map((color) => color.index - 1));
  const binary = new Uint8Array(width * height);
  for (let index = 0; index < assignments.length; index += 1) {
    if (activeIndexes.has(assignments[index])) binary[index] = 1;
  }
  return binary;
}

function dilate(binary, width, height, radius) {
  const output = new Uint8Array(binary.length);
  const radiusPx = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let found = false;
      for (let yy = Math.max(0, y - radiusPx); yy <= Math.min(height - 1, y + radiusPx) && !found; yy += 1) {
        for (let xx = Math.max(0, x - radiusPx); xx <= Math.min(width - 1, x + radiusPx); xx += 1) {
          if (binary[width * yy + xx]) {
            found = true;
            break;
          }
        }
      }
      if (found) output[width * y + x] = 1;
    }
  }
  return output;
}

function boundaryPaths(binary, width, height) {
  const segments = new Map();
  const add = (x1, y1, x2, y2) => {
    const key = `${x1},${y1}`;
    const value = `${x2},${y2}`;
    const list = segments.get(key) || [];
    list.push(value);
    segments.set(key, list);
  };
  const active = (x, y) => x >= 0 && x < width && y >= 0 && y < height && binary[width * y + x] === 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!active(x, y)) continue;
      if (!active(x, y - 1)) add(x, y, x + 1, y);
      if (!active(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!active(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!active(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const paths = [];
  while (segments.size > 0) {
    const start = segments.keys().next().value;
    let current = start;
    const points = [start];
    for (let guard = 0; guard < width * height * 8; guard += 1) {
      const nextList = segments.get(current);
      if (!nextList || nextList.length === 0) break;
      const next = nextList.pop();
      if (nextList.length === 0) segments.delete(current);
      points.push(next);
      current = next;
      if (current === start) break;
    }
    if (points.length > 2) {
      const [firstX, firstY] = points[0].split(',').map(Number);
      const lines = points.slice(1).map((point) => {
        const [x, y] = point.split(',').map(Number);
        return `L${x} ${y}`;
      });
      paths.push(`M${firstX} ${firstY}${lines.join('')}Z`);
    }
  }
  return paths.join('');
}

function svgDocument({ width, height, body, label = 'Vector output', physicalWidthCm }) {
  const physicalWidth = physicalWidthCm ? ` width="${physicalWidthCm}cm"` : ` width="${width}"`;
  const physicalHeight = physicalWidthCm ? ` height="${(physicalWidthCm * height) / width}cm"` : ` height="${height}"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"${physicalWidth}${physicalHeight} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
${body}
</svg>`;
}

function buildFullSvg({ colors, assignments, width, height, settings }) {
  const groups = colors
    .map((color) => {
      const path = rowRunPath(assignments, width, height, color.index - 1);
      return `<g id="color-${String(color.index).padStart(2, '0')}" data-color="${color.hex}">
<path d="${path}" fill="${color.hex}" fill-rule="evenodd"/>
</g>`;
    })
    .join('\n');
  return svgDocument({ width, height, body: groups, label: 'Sticker and screen print vector', physicalWidthCm: settings.actualWidthCm });
}

function buildFilmSvg({ color, assignments, width, height, settings, activeIndexes, label }) {
  const path = rowRunPath(assignments, width, height, activeIndexes);
  const body = `<g id="film-artwork">
<path d="${path}" fill="#000000" fill-rule="evenodd"/>
</g>
<text x="8" y="${height - 8}" fill="#000000" font-family="Arial, sans-serif" font-size="12">${escapeXml(label)}</text>`;
  return svgDocument({ width, height, body, label, physicalWidthCm: settings.actualWidthCm });
}

function buildCutlineSvg({ assignments, colors, width, height, settings, bounds }) {
  const actualWidthCm = normalizeNumber(settings.actualWidthCm, 10);
  const offsetMm = normalizeNumber(settings.stickerCutlineOffsetMm, 2);
  const mmPerPixel = (actualWidthCm * 10) / Math.max(1, bounds.width);
  const radiusPx = clamp(Math.round(offsetMm / mmPerPixel), 1, 128);
  const binary = binaryFromAssignments(assignments, width, height, colors);
  const outline = boundaryPaths(dilate(binary, width, height, radiusPx), width, height);
  const fullColor = colors
    .map((color) => `<path d="${rowRunPath(assignments, width, height, color.index - 1)}" fill="${color.hex}" fill-rule="evenodd"/>`)
    .join('\n');
  const body = `${fullColor}
<g id="CutContour" data-spot-color="CutContour">
<path d="${outline}" fill="none" stroke="#FF00FF" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</g>`;
  return svgDocument({ width, height, body, label: `Sticker cutline ${offsetMm} mm`, physicalWidthCm: actualWidthCm });
}

async function svgToPdfBlob(svg, width, height, physicalWidthCm) {
  const { jsPDF } = await import('jspdf');
  const widthMm = normalizeNumber(physicalWidthCm, 10) * 10;
  const heightMm = (widthMm * height) / width;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(2400, Math.max(320, width * 2));
    canvas.height = Math.round((canvas.width * height) / width);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pdf = new jsPDF({
      orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm]
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
    return pdf.output('blob');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileUrl(blob) {
  return URL.createObjectURL(blob);
}

async function addSvgPdf(zip, name, svg, width, height, settings) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const pdfBlob = await svgToPdfBlob(svg, width, height, settings.actualWidthCm);
  zip.file(`${name}.svg`, svgBlob);
  zip.file(`${name}.pdf`, pdfBlob);
  return {
    svgBlob,
    pdfBlob,
    svg: fileUrl(svgBlob),
    pdf: fileUrl(pdfBlob)
  };
}

export async function processImageLocally(file, settings) {
  const { default: JSZip } = await import('jszip');
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const palette = buildPalette(imageData, settings);
  const { assignments, colors } = assignPixels(imageData, palette, settings);
  const outputColors = colors;
  const printable = printableColors(outputColors, settings, width, height);
  const bounds = mergeBounds(printable, width, height);
  const fullSvg = buildFullSvg({ colors: outputColors, assignments, width, height, settings });
  const zip = new JSZip();
  const previewBlob = await canvasToBlob(canvas);
  const fullSvgPdf = await addSvgPdf(zip, 'full-vector', fullSvg, width, height, settings);
  zip.file('preview-full-color.png', previewBlob);
  zip.file('palette.json', JSON.stringify(palette, null, 2));

  const separations = [];
  if (settings.separateColors) {
    if (settings.createUnderbaseFilm && printable.length > 0) {
      const label = 'FILM DASAR - HITAM 100%';
      const film = buildFilmSvg({
        assignments,
        width,
        height,
        settings,
        activeIndexes: new Set(printable.map((color) => color.index - 1)),
        label
      });
      const files = await addSvgPdf(zip, 'separations/film-underbase', film, width, height, settings);
      separations.push({ index: 'underbase', kind: 'underbase', hex: '#000000', label, ...files });
    }

    for (const color of printable) {
      const index = String(color.index).padStart(2, '0');
      const label = `FILM ${index} - ${color.hex}`;
      const film = buildFilmSvg({
        color,
        assignments,
        width,
        height,
        settings,
        activeIndexes: color.index - 1,
        label
      });
      const files = await addSvgPdf(zip, `separations/film-color-${index}`, film, width, height, settings);
      separations.push({ index: color.index, kind: 'color', hex: color.hex, label, ...files });
    }
  }

  let stickerCutline = null;
  if (settings.productionType === 'sticker' && settings.stickerCutlineEnabled && printable.length > 0) {
    const cutlineSvg = buildCutlineSvg({ assignments, colors: printable, width, height, settings, bounds });
    stickerCutline = await addSvgPdf(zip, 'sticker-cutline', cutlineSvg, width, height, settings);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const separationFilmCount = separations.length;
  const priceIdr = calculateJobPrice({
    inputMode: settings.inputMode,
    separationFilmCount,
    retouchAlreadyCharged: settings.inputMode === INPUT_MODE_RETOUCH
  });

  return {
    jobId: `local-${Date.now()}`,
    status: 'done',
    progress: 100,
    message: 'Selesai diproses lokal. File tidak disimpan di server.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    localOnly: true,
    priceIdr,
    separationFilmCount,
    palette,
    settings,
    files: {
      fullPng: fileUrl(previewBlob),
      fullSvg: fullSvgPdf.svg,
      fullPdf: fullSvgPdf.pdf,
      stickerCutlineSvg: stickerCutline?.svg,
      stickerCutlinePdf: stickerCutline?.pdf,
      zip: fileUrl(zipBlob),
      separations
    },
    manifest: {
      width,
      height,
      palette,
      separationFilmCount,
      hasStickerCutline: Boolean(stickerCutline),
      generatedFiles: ['preview-full-color.png', 'full-vector.svg', 'full-vector.pdf', 'result.zip']
    }
  };
}
