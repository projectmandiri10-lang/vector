import { INPUT_MODE_RETOUCH } from './modes.js';
import { buildPrintLayout, createArtworkRegistrationMarks } from './localPrint.js';
import { calculateJobPrice } from './pricing.js';

const MAX_CANVAS_EDGE = 2048;
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

function colorChroma({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function averageChannel({ r, g, b }) {
  return (r + g + b) / 3;
}

function shouldUseHardSpotColors(settings = {}) {
  return settings.productionType === 'sablon' || settings.separateColors === true;
}

function requestedSpotColorLimit(settings = {}) {
  return clamp(Number.parseInt(settings.maxColors || 4, 10), 2, 6);
}

function canonicalizeSpotPixel(pixel, settings = {}) {
  if (!shouldUseHardSpotColors(settings)) return pixel;
  if (colorChroma(pixel) <= 32) {
    return averageChannel(pixel) >= 165 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  }
  return pixel;
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

function mergeSimilarColors(colors, maxColors, mergeDistance = 42) {
  const merged = [];
  for (const color of colors) {
    const existing = merged.find((candidate) => colorDistance(candidate, color) < mergeDistance);
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

function dropTinySpotColors(colors, enabled) {
  if (!enabled || colors.length <= 3) return colors;
  const total = colors.reduce((sum, color) => sum + color.count, 0);
  const minPixels = Math.max(24, total * 0.001);
  const filtered = colors.filter((color) => color.count >= minPixels);
  return filtered.length >= 2 ? filtered : colors;
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
    const quantizedPixel = canonicalizeSpotPixel(pixel, settings);
    const key = `${Math.floor(quantizedPixel.r / BIN_SIZE)}-${Math.floor(quantizedPixel.g / BIN_SIZE)}-${Math.floor(quantizedPixel.b / BIN_SIZE)}`;
    const current = histogram.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += quantizedPixel.r;
    current.g += quantizedPixel.g;
    current.b += quantizedPixel.b;
    current.count += 1;
    histogram.set(key, current);
  }

  const useHardSpotColors = shouldUseHardSpotColors(settings);
  const requestedMaxColors = requestedSpotColorLimit(settings);
  const maxColors = useHardSpotColors
    ? clamp(Math.max(requestedMaxColors + 3, 5), 2, 8)
    : settings.colorLimitMode === 'manual'
      ? requestedMaxColors
      : 6;
  const mergeDistance = useHardSpotColors ? 150 : 42;
  const candidates = [...histogram.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  const palette = dropTinySpotColors(mergeSimilarColors(candidates, maxColors, mergeDistance), useHardSpotColors).map((color, index) => ({
    index: index + 1,
    hex: rgbToHex(color),
    r: color.r,
    g: color.g,
    b: color.b,
    pixelCount: color.count
  }));

  return palette.length > 0 ? palette : [{ index: 1, hex: '#000000', r: 0, g: 0, b: 0, pixelCount: 0 }];
}

function remapAssignmentsToSelectedColors(assignments, colors, selectedColors, width, height) {
  if (selectedColors.length === 0) {
    return { assignments, colors };
  }

  const kept = selectedColors.map((color, index) => ({
    ...color,
    originalAssignmentIndex: color.index - 1,
    index: index + 1
  }));
  const oldToNewIndex = new Map();
  const remapDroppedIndex = new Map();

  kept.forEach((color, index) => {
    oldToNewIndex.set(color.originalAssignmentIndex, index);
  });

  colors.forEach((color) => {
    if (oldToNewIndex.has(color.index - 1)) return;
    const nearest = nearestColorIndex(color, kept);
    remapDroppedIndex.set(color.index - 1, nearest);
  });

  const output = new Int16Array(assignments.length);
  output.fill(-1);
  for (let index = 0; index < assignments.length; index += 1) {
    const colorIndex = assignments[index];
    if (colorIndex < 0) continue;
    output[index] = oldToNewIndex.has(colorIndex) ? oldToNewIndex.get(colorIndex) : remapDroppedIndex.get(colorIndex);
  }

  const normalizedPalette = kept.map(({ originalAssignmentIndex, ...color }) => color);
  return {
    assignments: output,
    colors: recomputeColors(output, normalizedPalette, width, height)
  };
}

function enforcePrintableColorLimit(assignments, colors, settings, width, height) {
  if (!shouldUseHardSpotColors(settings)) {
    return { assignments, colors };
  }

  const limit = requestedSpotColorLimit(settings);
  const selectedColors =
    colors.length <= limit ? colors : [...colors].sort((left, right) => right.count - left.count).slice(0, limit);

  return {
    ...remapAssignmentsToSelectedColors(assignments, colors, selectedColors, width, height),
    wasColorLimited: colors.length > selectedColors.length
  };
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

function recomputeColors(assignments, palette, width, height) {
  const colors = palette.map((color) => ({
    ...color,
    count: 0,
    touchesTop: false,
    touchesRight: false,
    touchesBottom: false,
    touchesLeft: false,
    bounds: { x: width, y: height, maxX: 0, maxY: 0, width: 0, height: 0 }
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorIndex = assignments[width * y + x];
      if (colorIndex < 0) continue;
      const color = colors[colorIndex];
      color.count += 1;
      color.touchesTop ||= y === 0;
      color.touchesRight ||= x === width - 1;
      color.touchesBottom ||= y === height - 1;
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

  return colors.filter((color) => color.count > 0);
}

function shouldRemoveEdgeComponent(component, color, width, height) {
  const totalPixels = Math.max(1, width * height);
  const coverage = component.count / totalPixels;
  const boundsCoverage = (component.width * component.height) / totalPixels;
  const lowChroma = colorChroma(color) <= 36;
  if (lowChroma) return true;
  return component.edgeCount >= 2 && (coverage >= 0.01 || boundsCoverage >= 0.22);
}

function shouldSearchEnclosedBackground(component, color, width, height) {
  const totalPixels = Math.max(1, width * height);
  const coverage = component.count / totalPixels;
  const boundsCoverage = (component.width * component.height) / totalPixels;
  const lowChroma = colorChroma(color) <= 36;
  const broadEdgeBackground = component.edgeCount >= 2 && (coverage >= 0.01 || boundsCoverage >= 0.22);
  return broadEdgeBackground || (lowChroma && component.edgeCount >= 3 && boundsCoverage >= 0.18);
}

function removeEnclosedBackgroundComponents(output, width, height, backgroundColorIndexes) {
  const visited = new Uint8Array(output.length);
  for (let start = 0; start < output.length; start += 1) {
    const colorIndex = output[start];
    if (visited[start] || !backgroundColorIndexes.has(colorIndex)) continue;

    const stack = [start];
    const pixels = [];
    let touchesCanvasEdge = false;
    const adjacentSides = new Set();
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      pixels.push(current);
      touchesCanvasEdge ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;

      const neighbors = [
        [x - 1, y, 'left'],
        [x + 1, y, 'right'],
        [x, y - 1, 'top'],
        [x, y + 1, 'bottom']
      ];
      for (const [nextX, nextY, side] of neighbors) {
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = width * nextY + nextX;
        const nextColorIndex = output[next];
        if (nextColorIndex === colorIndex) {
          if (!visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        } else if (nextColorIndex >= 0 && !backgroundColorIndexes.has(nextColorIndex)) {
          adjacentSides.add(side);
        }
      }
    }

    if (!touchesCanvasEdge && adjacentSides.size >= 3) {
      pixels.forEach((pixel) => {
        output[pixel] = -1;
      });
    }
  }
}

function removeEdgeConnectedBackground(assignments, palette, width, height, settings = {}) {
  if (settings.removeBackground !== true || settings.includeBackgroundInFilmSize === true) {
    return {
      assignments,
      colors: recomputeColors(assignments, palette, width, height)
    };
  }

  const output = new Int16Array(assignments);
  const visited = new Uint8Array(assignments.length);
  const edgeStarts = [];
  const backgroundColorIndexes = new Set();

  for (let x = 0; x < width; x += 1) {
    edgeStarts.push(x, width * (height - 1) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    edgeStarts.push(width * y, width * y + width - 1);
  }

  for (const start of edgeStarts) {
    if (visited[start] || output[start] < 0) continue;
    const colorIndex = output[start];
    const color = palette[colorIndex];
    const stack = [start];
    const pixels = [];
    let count = 0;
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;
    let touchesTop = false;
    let touchesRight = false;
    let touchesBottom = false;
    let touchesLeft = false;
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
      touchesTop ||= y === 0;
      touchesRight ||= x === width - 1;
      touchesBottom ||= y === height - 1;
      touchesLeft ||= x === 0;

      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= output.length || visited[next] || output[next] !== colorIndex) continue;
        const nextX = next % width;
        const currentX = current % width;
        if (Math.abs(nextX - currentX) > 1 && (next === current - 1 || next === current + 1)) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    const component = {
      count,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      edgeCount: [touchesTop, touchesRight, touchesBottom, touchesLeft].filter(Boolean).length
    };
    if (shouldRemoveEdgeComponent(component, color, width, height)) {
      pixels.forEach((pixel) => {
        output[pixel] = -1;
      });
      if (shouldSearchEnclosedBackground(component, color, width, height)) {
        backgroundColorIndexes.add(colorIndex);
      }
    }
  }

  if (backgroundColorIndexes.size > 0) {
    removeEnclosedBackgroundComponents(output, width, height, backgroundColorIndexes);
  }

  const colors = recomputeColors(output, palette, width, height);
  if (colors.length === 0) {
    return {
      assignments,
      colors: recomputeColors(assignments, palette, width, height)
    };
  }

  return {
    assignments: output,
    colors
  };
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
      const colorIndex = nearestColorIndex(canonicalizeSpotPixel(pixel, settings), palette);
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
  if (settings.removeBackground !== true || settings.includeBackgroundInFilmSize === true) return colors;
  const background = [...colors]
    .filter((color) => color.touchesTop && color.touchesRight && color.touchesBottom && color.touchesLeft)
    .sort((a, b) => b.count - a.count)[0];
  const filtered = background ? colors.filter((color) => color.index !== background.index) : colors;
  return filtered.length > 0 ? filtered : colors;
}

function fullCanvasBounds(width, height) {
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

function touchesEdgeCount(bounds, width, height) {
  const tolerance = 2;
  return [
    bounds.x <= tolerance,
    bounds.y <= tolerance,
    bounds.maxX >= width - tolerance,
    bounds.maxY >= height - tolerance
  ].filter(Boolean).length;
}

function isEdgeDominantBackground(color, width, height) {
  const totalPixels = Math.max(1, width * height);
  const boundsArea = Math.max(1, color.bounds.width * color.bounds.height);
  const edgeCount = touchesEdgeCount(color.bounds, width, height);
  const canvasCoverage = color.count / totalPixels;
  const boundsCoverage = boundsArea / totalPixels;

  return edgeCount >= 2 && canvasCoverage >= 0.03 && boundsCoverage >= 0.25;
}

function backgroundColors(colors, width, height) {
  const candidates = colors.filter((color) => touchesCanvas(color.bounds, width, height) || isEdgeDominantBackground(color, width, height));
  if (candidates.length === 0 || candidates.length >= colors.length) return [];
  return candidates.sort((left, right) => right.count - left.count);
}

function createFilmPlan(colors, width, height, settings = {}) {
  if (settings.removeBackground !== true || settings.includeBackgroundInFilmSize === true) {
    return {
      colors,
      bounds: fullCanvasBounds(width, height),
      backgroundColor: null
    };
  }

  const backgroundCandidates = backgroundColors(colors, width, height);
  const backgroundIndexes = new Set(backgroundCandidates.map((color) => color.index));
  const filtered = backgroundIndexes.size > 0 ? colors.filter((color) => !backgroundIndexes.has(color.index)) : colors;
  const effectiveColors = filtered.length > 0 ? filtered : colors;

  return {
    colors: effectiveColors,
    bounds: mergeBounds(effectiveColors, width, height),
    backgroundColor: backgroundCandidates[0] || null,
    backgroundColors: backgroundCandidates
  };
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

function erode(binary, width, height, radius) {
  const output = new Uint8Array(binary.length);
  const radiusPx = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let allActive = true;
      for (let yy = Math.max(0, y - radiusPx); yy <= Math.min(height - 1, y + radiusPx) && allActive; yy += 1) {
        for (let xx = Math.max(0, x - radiusPx); xx <= Math.min(width - 1, x + radiusPx); xx += 1) {
          if (!binary[width * yy + xx]) {
            allActive = false;
            break;
          }
        }
      }
      if (allActive) output[width * y + x] = 1;
    }
  }
  return output;
}

function findBinaryComponents(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const components = [];
  for (let start = 0; start < binary.length; start += 1) {
    if (visited[start] || !binary[start]) continue;

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
        if (visited[next] || !binary[next]) continue;
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

function refineBinaryForTrace(binary, width, height) {
  const totalPixels = Math.max(1, width * height);
  const output = new Uint8Array(binary.length);
  const components = findBinaryComponents(binary, width, height);

  for (const component of components) {
    if (component.count <= 10 || (component.count <= 48 && (component.width <= 3 || component.height <= 3))) continue;

    const coverage = component.count / totalPixels;
    const boundsCoverage = component.boundsArea / totalPixels;
    const isLarge = coverage >= 0.025 || boundsCoverage >= 0.055;
    const isMedium = coverage >= 0.004 || boundsCoverage >= 0.01;
    const radius = isLarge || isMedium ? 1 : 1;
    let mask = new Uint8Array(binary.length);
    component.pixels.forEach((pixel) => {
      mask[pixel] = 1;
    });

    mask = erode(dilate(mask, width, height, radius), width, height, radius);
    if (isLarge || isMedium) {
      mask = dilate(erode(mask, width, height, radius), width, height, radius);
    }

    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) output[index] = 1;
    }
  }

  return output;
}

function refineAssignmentsForTrace(assignments, colors, width, height, settings = {}) {
  if (settings.edgeRefinement === false) {
    return {
      assignments,
      colors: recomputeColors(assignments, colors, width, height)
    };
  }

  const output = new Int16Array(assignments.length);
  output.fill(-1);
  const colorsBySize = [...colors].sort((left, right) => right.count - left.count);

  for (const color of colorsBySize) {
    const colorIndex = color.index - 1;
    const binary = new Uint8Array(assignments.length);
    for (let index = 0; index < assignments.length; index += 1) {
      if (assignments[index] === colorIndex) binary[index] = 1;
    }
    const refined = refineBinaryForTrace(binary, width, height);
    for (let index = 0; index < refined.length; index += 1) {
      if (refined[index]) output[index] = colorIndex;
    }
  }

  const refinedColors = recomputeColors(output, colors, width, height);
  return refinedColors.length > 0
    ? { assignments: output, colors: refinedColors }
    : { assignments, colors: recomputeColors(assignments, colors, width, height) };
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

function pathFromAssignments(assignments, width, height, activeIndexes) {
  const active = activeIndexes instanceof Set ? activeIndexes : new Set([activeIndexes]);
  const binary = new Uint8Array(width * height);
  for (let index = 0; index < assignments.length; index += 1) {
    if (active.has(assignments[index])) binary[index] = 1;
  }
  return boundaryPaths(binary, width, height) || rowRunPath(assignments, width, height, active);
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
      const path = pathFromAssignments(assignments, width, height, color.index - 1);
      return `<g id="color-${String(color.index).padStart(2, '0')}" data-color="${color.hex}">
<path d="${path}" fill="${color.hex}" fill-rule="evenodd"/>
</g>`;
    })
    .join('\n');
  return svgDocument({ width, height, body: groups, label: 'Sticker and screen print vector', physicalWidthCm: settings.actualWidthCm });
}

function buildFilmSvg({ assignments, width, height, settings, activeIndexes, label, bounds }) {
  const artworkBounds = bounds || fullCanvasBounds(width, height);
  const path = pathFromAssignments(assignments, width, height, activeIndexes);
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
  const transform = `translate(${layout.artworkX.toFixed(3)} ${layout.artworkY.toFixed(3)}) scale(${layout.scale.toFixed(8)}) translate(${(-artworkBounds.x).toFixed(3)} ${(-artworkBounds.y).toFixed(3)})`;
  const body = `${marks}
<g id="film-artwork" transform="${transform}">
<path d="${path}" fill="#000000" fill-rule="evenodd"/>
</g>
<text x="${layout.artworkX.toFixed(3)}" y="${(layout.artworkY + layout.artworkHeightMm + 12).toFixed(3)}" fill="#000000" font-family="Arial, sans-serif" font-size="4">${escapeXml(label)}</text>`;

  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.paperWidthMm}mm" height="${layout.paperHeightMm}mm" viewBox="0 0 ${layout.paperWidthMm} ${layout.paperHeightMm}" role="img" aria-label="${escapeXml(label)}">
${body}
</svg>`,
    previewWidth: layout.paperWidthMm,
    previewHeight: layout.paperHeightMm
  };
}

function buildCutlineSvg({ assignments, colors, width, height, settings, bounds }) {
  const actualWidthCm = normalizeNumber(settings.actualWidthCm, 10);
  const offsetMm = normalizeNumber(settings.stickerCutlineOffsetMm, 2);
  const mmPerPixel = (actualWidthCm * 10) / Math.max(1, bounds.width);
  const radiusPx = clamp(Math.round(offsetMm / mmPerPixel), 1, 128);
  const binary = binaryFromAssignments(assignments, width, height, colors);
  const outline = boundaryPaths(dilate(binary, width, height, radiusPx), width, height);
  const fullColor = colors
    .map((color) => `<path d="${pathFromAssignments(assignments, width, height, color.index - 1)}" fill="${color.hex}" fill-rule="evenodd"/>`)
    .join('\n');
  const body = `${fullColor}
<g id="CutContour" data-spot-color="CutContour">
<path d="${outline}" fill="none" stroke="#FF00FF" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</g>`;
  return svgDocument({ width, height, body, label: `Sticker cutline ${offsetMm} mm`, physicalWidthCm: actualWidthCm });
}

function parseSvgLength(value, fallbackPx = 1024) {
  if (!value) {
    return {
      css: `${fallbackPx}px`,
      viewportPx: fallbackPx,
      pdfPoints: fallbackPx * 0.75
    };
  }

  const match = String(value).match(/^([\d.]+)([a-z%]*)$/i);
  if (!match) {
    return {
      css: `${fallbackPx}px`,
      viewportPx: fallbackPx,
      pdfPoints: fallbackPx * 0.75
    };
  }

  const amount = Number(match[1]);
  const unit = match[2] || 'px';

  if (unit === 'mm') {
    return {
      css: `${amount}mm`,
      viewportPx: Math.ceil((amount / 25.4) * 96),
      pdfPoints: (amount / 25.4) * 72
    };
  }

  if (unit === 'cm') {
    return {
      css: `${amount}cm`,
      viewportPx: Math.ceil((amount / 2.54) * 96),
      pdfPoints: (amount / 2.54) * 72
    };
  }

  return {
    css: `${amount}px`,
    viewportPx: Math.ceil(amount),
    pdfPoints: amount * 0.75
  };
}

function dimensionsFromSvg(svg, fallbackWidth = 1024, fallbackHeight = 1024) {
  const widthMatch = svg.match(/\swidth="([^"]+)"/);
  const heightMatch = svg.match(/\sheight="([^"]+)"/);
  return {
    width: parseSvgLength(widthMatch?.[1], fallbackWidth),
    height: parseSvgLength(heightMatch?.[1], fallbackHeight)
  };
}

async function svgToPdfBlob(svg, fallbackWidth, fallbackHeight) {
  const { jsPDF } = await import('jspdf');
  const { width, height } = dimensionsFromSvg(svg, fallbackWidth, fallbackHeight);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(2400, Math.max(320, width.viewportPx));
    canvas.height = Math.min(3200, Math.max(320, height.viewportPx));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pdf = new jsPDF({
      orientation: width.pdfPoints >= height.pdfPoints ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [(width.pdfPoints / 72) * 25.4, (height.pdfPoints / 72) * 25.4]
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, (width.pdfPoints / 72) * 25.4, (height.pdfPoints / 72) * 25.4);
    return pdf.output('blob');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function svgToPngBlob(svg, fallbackWidth, fallbackHeight, options = {}) {
  const { width, height } = dimensionsFromSvg(svg, fallbackWidth, fallbackHeight);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = normalizeNumber(options.scale, 2);
    const maxWidth = normalizeNumber(options.maxWidth, 2400);
    const maxHeight = normalizeNumber(options.maxHeight, 3200);
    canvas.width = Math.min(maxWidth, Math.max(640, Math.ceil(width.viewportPx * scale)));
    canvas.height = Math.min(maxHeight, Math.max(640, Math.ceil(height.viewportPx * scale)));
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (options.background !== null) {
      context.fillStyle = options.background || '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileUrl(blob) {
  return URL.createObjectURL(blob);
}

async function addSvgPdf(zip, name, svg, width, height, options = {}) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const pdfBlob = await svgToPdfBlob(svg, width, height);
  const previewBlob = options.includePreviewPng
    ? await svgToPngBlob(svg, options.previewWidth || width, options.previewHeight || height, {
        background: options.previewBackground || '#ffffff',
        scale: options.previewScale || 2
      })
    : null;
  zip.file(`${name}.svg`, svgBlob);
  zip.file(`${name}.pdf`, pdfBlob);
  if (previewBlob && options.includePreviewPng !== false) {
    zip.file(`${name}-preview.png`, previewBlob);
  }
  return {
    svgBlob,
    pdfBlob,
    previewBlob,
    svg: fileUrl(svgBlob),
    pdf: fileUrl(pdfBlob),
    preview: previewBlob ? fileUrl(previewBlob) : ''
  };
}

export async function processImageLocally(file, settings) {
  const { default: JSZip } = await import('jszip');
  const effectiveSettings =
    settings.inputMode === 'ready_trace'
      ? {
          ...settings,
          makeVector: true,
          separateColors: settings.productionType === 'sablon' ? true : settings.separateColors,
          stickerCutlineEnabled: settings.productionType === 'sticker' ? true : settings.stickerCutlineEnabled
        }
      : settings;
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const palette = buildPalette(imageData, effectiveSettings);
  const assigned = assignPixels(imageData, palette, effectiveSettings);
  const cleaned = removeEdgeConnectedBackground(assigned.assignments, palette, width, height, effectiveSettings);
  const limited = enforcePrintableColorLimit(cleaned.assignments, cleaned.colors, effectiveSettings, width, height);
  const refined = refineAssignmentsForTrace(limited.assignments, limited.colors, width, height, effectiveSettings);
  const assignments = refined.assignments;
  const outputColors = refined.colors;
  const filmPlan = createFilmPlan(outputColors, width, height, effectiveSettings);
  const printable = filmPlan.colors;
  const exportColors = settings.removeBackground === true && settings.includeBackgroundInFilmSize !== true ? printable : outputColors;
  const bounds = filmPlan.bounds;
  const fullSvg = buildFullSvg({ colors: exportColors, assignments, width, height, settings: effectiveSettings });
  const zip = new JSZip();
  const separationZip = new JSZip();
  const fullSvgPdf = await addSvgPdf(zip, 'full-vector', fullSvg, width, height);
  const previewBlob = await svgToPngBlob(fullSvg, width, height, {
    background: null,
    scale: 4,
    maxWidth: 4096,
    maxHeight: 4096
  });
  zip.file('preview-full-color.png', previewBlob);
  zip.file('palette.json', JSON.stringify(exportColors, null, 2));

  const separations = [];
  if (settings.separateColors) {
    if (settings.createUnderbaseFilm && printable.length > 0) {
      const label = 'FILM DASAR - HITAM 100%';
      const film = buildFilmSvg({
        assignments,
        width,
        height,
        settings: effectiveSettings,
        activeIndexes: new Set(printable.map((color) => color.index - 1)),
        label,
        bounds: filmPlan.bounds
      });
      const files = await addSvgPdf(zip, 'separations/film-underbase', film.svg, width, height, {
        includePreviewPng: true,
        previewWidth: film.previewWidth,
        previewHeight: film.previewHeight
      });
      separationZip.file('film-underbase.svg', files.svgBlob);
      separationZip.file('film-underbase.pdf', files.pdfBlob);
      if (files.previewBlob) separationZip.file('film-underbase-preview.png', files.previewBlob);
      separations.push({ index: 'underbase', kind: 'underbase', hex: '#000000', label, ...files });
    }

    for (const color of printable) {
      const index = String(color.index).padStart(2, '0');
      const label = `FILM ${index} - ${color.hex}`;
      const film = buildFilmSvg({
        assignments,
        width,
        height,
        settings: effectiveSettings,
        activeIndexes: color.index - 1,
        label,
        bounds: filmPlan.bounds
      });
      const files = await addSvgPdf(zip, `separations/film-color-${index}`, film.svg, width, height, {
        includePreviewPng: true,
        previewWidth: film.previewWidth,
        previewHeight: film.previewHeight
      });
      separationZip.file(`film-color-${index}.svg`, files.svgBlob);
      separationZip.file(`film-color-${index}.pdf`, files.pdfBlob);
      if (files.previewBlob) separationZip.file(`film-color-${index}-preview.png`, files.previewBlob);
      separations.push({ index: color.index, kind: 'color', hex: color.hex, label, ...files });
    }
  }

  let stickerCutline = null;
  if (settings.productionType === 'sticker' && settings.stickerCutlineEnabled && printable.length > 0) {
    const cutlineSvg = buildCutlineSvg({ assignments, colors: printable, width, height, settings: effectiveSettings, bounds });
    stickerCutline = await addSvgPdf(zip, 'sticker-cutline', cutlineSvg, width, height);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const separationZipBlob = separations.length > 0 ? await separationZip.generateAsync({ type: 'blob' }) : null;
  const separationFilmCount = separations.length;
  const priceIdr = calculateJobPrice({
    inputMode: settings.inputMode,
    separationFilmCount,
      retouchAlreadyCharged: effectiveSettings.inputMode === INPUT_MODE_RETOUCH
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
    palette: exportColors,
    settings: effectiveSettings,
    files: {
      fullPng: fileUrl(previewBlob),
      fullSvg: fullSvgPdf.svg,
      fullPdf: fullSvgPdf.pdf,
      stickerCutlineSvg: stickerCutline?.svg,
      stickerCutlinePdf: stickerCutline?.pdf,
      zip: fileUrl(zipBlob),
      separationZip: separationZipBlob ? fileUrl(separationZipBlob) : '',
      separations
    },
    artifactBlobs: {
      fullPng: previewBlob,
      fullSvg: fullSvgPdf.svgBlob,
      fullPdf: fullSvgPdf.pdfBlob,
      stickerCutlineSvg: stickerCutline?.svgBlob || null,
      stickerCutlinePdf: stickerCutline?.pdfBlob || null,
      zip: zipBlob,
      separationZip: separationZipBlob,
      separations: separations.map((separation) => ({
        index: separation.index,
        kind: separation.kind,
        hex: separation.hex,
        label: separation.label,
        svgBlob: separation.svgBlob,
        pdfBlob: separation.pdfBlob,
        previewBlob: separation.previewBlob || null
      }))
    },
    manifest: {
      width,
      height,
      palette: outputColors,
      separationFilmCount,
      hasStickerCutline: Boolean(stickerCutline),
      edgeRefinement: settings.edgeRefinement !== false,
      generatedFiles: [
        'preview-full-color.png',
        'full-vector.svg',
        'full-vector.pdf',
        stickerCutline ? 'sticker-cutline.svg' : null,
        stickerCutline ? 'sticker-cutline.pdf' : null,
        separations.length > 0 ? 'separation-films.zip' : null,
        'result.zip'
      ].filter(Boolean)
    }
  };
}
