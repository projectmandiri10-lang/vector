import archiver from 'archiver';
import fs from 'fs-extra';
import path from 'node:path';

async function archiveTo(zipPath, addEntries) {
  await fs.ensureDir(path.dirname(zipPath));
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') return;
      reject(error);
    });
    archive.on('error', reject);
    archive.pipe(output);
    addEntries(archive);
    archive.finalize();
  });
}

function fileIfExists(archive, filePath, name) {
  if (fs.existsSync(filePath)) archive.file(filePath, { name });
}

function dirIfExists(archive, dirPath, name) {
  if (fs.existsSync(dirPath)) archive.directory(dirPath, name);
}

export async function createResultZip(jobDir, zipPath) {
  await archiveTo(zipPath, (archive) => {
    fileIfExists(archive, path.join(jobDir, 'input.png'), 'input.png');
    fileIfExists(archive, path.join(jobDir, 'clean-input.png'), 'clean-input.png');
    fileIfExists(archive, path.join(jobDir, 'ai-redraw.png'), 'ai-redraw.png');
    fileIfExists(archive, path.join(jobDir, 'preview-full-color.png'), 'preview-full-color.png');
    fileIfExists(archive, path.join(jobDir, 'palette.json'), 'palette.json');
    fileIfExists(archive, path.join(jobDir, 'full-vector.svg'), 'full-vector.svg');
    fileIfExists(archive, path.join(jobDir, 'full-vector.pdf'), 'full-vector.pdf');
    dirIfExists(archive, path.join(jobDir, 'masks'), 'masks');
    dirIfExists(archive, path.join(jobDir, 'separations'), 'separations');
  });
}

export async function createSeparationZip(separationDir, zipPath) {
  await archiveTo(zipPath, (archive) => {
    dirIfExists(archive, separationDir, 'film-sablon');
  });
}
