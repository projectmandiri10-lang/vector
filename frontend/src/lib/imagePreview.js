function loadBitmapFromBlob(blob) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Gagal membuat preview gambar.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function createNormalizedImagePreviewBlob(blob, { maxEdge = 480, type = 'image/png', quality } = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error('Preview gambar hanya bisa dibuat dari Blob atau File.');
  }

  const bitmap = await loadBitmapFromBlob(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  return canvasToBlob(canvas, type, quality);
}
