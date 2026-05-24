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
    throw new Error(
      `Ukuran film tidak muat di kertas ${paperSize} ${paperOrientation}. Kecilkan ukuran cm, pilih A3, atau ubah orientasi.`
    );
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
