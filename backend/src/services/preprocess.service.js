import fs from 'fs-extra';
import path from 'node:path';
import sharp from 'sharp';

export async function preprocessUploadedImage(buffer, jobDir) {
  await fs.ensureDir(jobDir);

  const inputPath = path.join(jobDir, 'input.png');
  const cleanInputPath = path.join(jobDir, 'clean-input.png');

  const image = sharp(buffer, { failOn: 'error' }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('File gambar tidak valid atau tidak bisa dibaca.');
  }

  const resize = { width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true };
  await sharp(buffer, { failOn: 'error' }).rotate().resize(resize).png().toFile(inputPath);
  const cleanMeta = await sharp(inputPath)
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(cleanInputPath);

  return {
    inputPath,
    cleanInputPath,
    width: cleanMeta.width,
    height: cleanMeta.height,
    original: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format
    }
  };
}
