export function createRegistrationMarks(viewBox, margin) {
  const offset = Math.max(18, margin / 2);
  const points = [
    [viewBox.x + offset, viewBox.y + offset],
    [viewBox.x + viewBox.width - offset, viewBox.y + offset],
    [viewBox.x + offset, viewBox.y + viewBox.height - offset],
    [viewBox.x + viewBox.width - offset, viewBox.y + viewBox.height - offset]
  ];

  const marks = points
    .map(
      ([x, y]) => `<g class="registration-mark">
  <circle cx="${x}" cy="${y}" r="6"/>
  <line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}"/>
  <line x1="${x}" y1="${y - 10}" x2="${x}" y2="${y + 10}"/>
</g>`
    )
    .join('\n');

  return `<g id="registration-marks" fill="none" stroke="#000000" stroke-width="1">
${marks}
</g>`;
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
