import fs from 'fs-extra';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

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

function dimensionsFromSvg(svg) {
  const widthMatch = svg.match(/\swidth="([^"]+)"/);
  const heightMatch = svg.match(/\sheight="([^"]+)"/);
  const width = parseSvgLength(widthMatch?.[1], 1024);
  const height = parseSvgLength(heightMatch?.[1], 1024);

  return {
    width,
    height
  };
}

export async function exportSvgToPdf(svgPath, pdfPath) {
  const svg = await fs.readFile(svgPath, 'utf8');
  const { width, height } = dimensionsFromSvg(svg);
  await fs.ensureDir(path.dirname(pdfPath));

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: width.viewportPx, height: height.viewportPx, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:white;}svg{display:block;}</style></head><body>${svg}</body></html>`,
      { waitUntil: 'load' }
    );
    await page.pdf({
      path: pdfPath,
      width: width.css,
      height: height.css,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
  } catch (error) {
    await exportSvgToRasterPdf(svg, pdfPath, width, height);
  } finally {
    if (browser) await browser.close();
  }
}

export async function exportSvgToPng(svgPath, pngPath) {
  await fs.ensureDir(path.dirname(pngPath));
  await sharp(await fs.readFile(svgPath)).png().toFile(pngPath);
}

async function exportSvgToRasterPdf(svg, pdfPath, width, height) {
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width.pdfPoints, height.pdfPoints]);
  const png = await pdf.embedPng(pngBuffer);
  page.drawImage(png, { x: 0, y: 0, width: width.pdfPoints, height: height.pdfPoints });
  await fs.writeFile(pdfPath, await pdf.save());
}
