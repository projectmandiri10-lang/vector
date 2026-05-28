export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

export function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function colorChroma({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function averageChannel({ r, g, b }) {
  return (r + g + b) / 3;
}

export function isLowChroma(color, tolerance = 18) {
  return colorChroma(color) <= tolerance;
}

export function canonicalizeSpotPixel(pixel, options = {}) {
  if (options.productionType !== 'sablon' && options.separateColors !== true) return pixel;
  if (colorChroma(pixel) <= 32) {
    return averageChannel(pixel) >= 165 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  }
  return pixel;
}

export function isNearWhite({ r, g, b }) {
  return r >= 242 && g >= 242 && b >= 242;
}

export function nearestColorIndex(pixel, palette) {
  const candidatePalette = isLowChroma(pixel) ? palette.filter((color) => isLowChroma(color)) : palette;
  const candidates = candidatePalette.length > 0 ? candidatePalette : palette;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((color) => {
    const distance = colorDistance(pixel, color);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = palette.indexOf(color);
    }
  });

  return bestIndex;
}
