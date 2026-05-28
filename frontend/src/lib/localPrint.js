const paperSizes = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 }
};

export function getPaperSizeMm(paperSize = 'A4', orientation = 'portrait') {
  const size = paperSizes[paperSize] || paperSizes.A4;
  if (orientation === 'landscape') {
    return { widthMm: size.heightMm, heightMm: size.widthMm };
  }
  return { ...size };
}

export function normalizeActualWidthCm(value, fallback = 10) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function buildPrintLayout({
  sourceWidth,
  sourceHeight,
  actualWidthCm = 10,
  paperSize = 'A4',
  paperOrientation = 'portrait'
}) {
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Ukuran artwork tidak valid untuk export film.');
  }

  const { widthMm: paperWidthMm, heightMm: paperHeightMm } = getPaperSizeMm(paperSize, paperOrientation);
  const artworkWidthMm = normalizeActualWidthCm(actualWidthCm) * 10;
  const artworkHeightMm = artworkWidthMm * (sourceHeight / sourceWidth);
  const markClearanceMm = 14;
  const labelSpaceMm = 14;
  const requiredWidthMm = artworkWidthMm + markClearanceMm * 2;
  const requiredHeightMm = artworkHeightMm + markClearanceMm * 2 + labelSpaceMm;

  if (requiredWidthMm > paperWidthMm || requiredHeightMm > paperHeightMm) {
    throw new Error(`Ukuran film tidak muat di kertas ${paperSize} ${paperOrientation}. Kecilkan ukuran cm, pilih A3, atau ubah orientasi.`);
  }

  const artworkX = (paperWidthMm - artworkWidthMm) / 2;
  const artworkY = (paperHeightMm - (artworkHeightMm + labelSpaceMm)) / 2;

  return {
    paperWidthMm,
    paperHeightMm,
    artworkWidthMm,
    artworkHeightMm,
    artworkX,
    artworkY,
    scale: artworkWidthMm / sourceWidth,
    markClearanceMm,
    labelSpaceMm
  };
}

export function createArtworkRegistrationMarks(artworkBox, options = {}) {
  const offset = options.offsetMm ?? 8;
  const radius = options.radiusMm ?? 2;
  const lineHalf = options.lineHalfMm ?? 5;
  const strokeWidth = options.strokeWidthMm ?? 0.25;
  const points = [
    [artworkBox.x - offset, artworkBox.y - offset],
    [artworkBox.x + artworkBox.width + offset, artworkBox.y - offset],
    [artworkBox.x - offset, artworkBox.y + artworkBox.height + offset],
    [artworkBox.x + artworkBox.width + offset, artworkBox.y + artworkBox.height + offset]
  ];

  const marks = points
    .map(
      ([x, y]) => `<g class="registration-mark">
  <circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${radius}"/>
  <line x1="${(x - lineHalf).toFixed(3)}" y1="${y.toFixed(3)}" x2="${(x + lineHalf).toFixed(3)}" y2="${y.toFixed(3)}"/>
  <line x1="${x.toFixed(3)}" y1="${(y - lineHalf).toFixed(3)}" x2="${x.toFixed(3)}" y2="${(y + lineHalf).toFixed(3)}"/>
</g>`
    )
    .join('\n');

  return `<g id="registration-marks" fill="none" stroke="#000000" stroke-width="${strokeWidth}">
${marks}
</g>`;
}
