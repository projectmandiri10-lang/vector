import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import { formatRupiah, IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR } from '../lib/pricing.js';

const rasterMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const rasterExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const readyTraceMimeTypes = new Set(['image/svg+xml']);
const readyTraceExtensions = new Set(['.svg']);

const modeOptions = [
  {
    value: INPUT_MODE_RETOUCH,
    title: 'Gambar perlu digambar ulang',
    description: 'Untuk foto buram, scan, atau logo yang perlu dirapikan sebelum diproses.',
    priceIdr: IMAGE_RETOUCH_PRICE_IDR,
    helper: 'Upload JPG, PNG, atau WebP. Cocok untuk foto logo yang masih perlu dibersihkan sebelum redraw AI.',
    accept: 'image/png,image/jpeg,image/webp',
    badge: 'Raster + AI'
  },
  {
    value: INPUT_MODE_READY,
    title: 'Vector Siap Proses',
    description: 'Tanpa AI. Khusus file vector murni untuk pisah warna dan contour sticker.',
    priceIdr: READY_PROCESS_PRICE_IDR,
    helper: 'Upload SVG vector murni. EPS/AI akan mengikuti jalur ini setelah parser dedicated diaktifkan.',
    accept: '.svg,image/svg+xml',
    badge: 'Vector only'
  }
];

export default function UploadBox({ file, previewUrl, inputMode, onInputModeChange, onFileChange, disabled }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const hasPreview = Boolean(file && previewUrl);
  const activeOption = useMemo(() => modeOptions.find((option) => option.value === inputMode) || modeOptions[0], [inputMode]);

  useEffect(() => {
    setUploadError('');
  }, [inputMode]);

  function getExtension(name = '') {
    const lastDot = name.lastIndexOf('.');
    return lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';
  }

  function validateFile(nextFile) {
    const extension = getExtension(nextFile.name);
    if (inputMode === INPUT_MODE_READY) {
      if (readyTraceExtensions.has(extension) && (!nextFile.type || readyTraceMimeTypes.has(nextFile.type))) return '';
      return 'Vector Siap Proses hanya menerima file vector SVG. EPS/AI belum aktif di server.';
    }
    if (rasterExtensions.has(extension) && (!nextFile.type || rasterMimeTypes.has(nextFile.type))) return '';
    return 'Mode gambar ulang hanya menerima JPG, PNG, atau WebP.';
  }

  function handleChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    const validationMessage = validateFile(nextFile);
    if (validationMessage) {
      setUploadError(validationMessage);
      event.target.value = '';
      return;
    }
    setUploadError('');
    setPreviewFailed(false);
    onFileChange(nextFile);
  }

  const isValidType = !uploadError;
  const isValidSize = file ? file.size <= 10 * 1024 * 1024 : true;
  const showRasterGuidelines = inputMode === INPUT_MODE_RETOUCH;
  const uploadZone = (
    <label
      className={`relative flex cursor-pointer overflow-hidden border border-dashed px-4 py-5 text-center transition ${
        hasPreview ? 'border-spruce bg-white' : 'border-line bg-panel hover:border-spruce hover:bg-white'
      } ${showRasterGuidelines ? 'min-h-40 md:min-h-44' : 'min-h-56'}`}
    >
      {hasPreview && (
        <div className="absolute inset-0">
          {previewFailed ? (
            <div className="checkerboard flex h-full w-full items-center justify-center p-4">
              <p className="max-w-sm px-3 py-6 text-sm font-medium text-tomato">Preview lokal gagal ditampilkan, tetapi file tetap siap diproses.</p>
            </div>
          ) : (
            <img className="h-full w-full object-cover" src={previewUrl} alt="Preview gambar asli" onError={() => setPreviewFailed(true)} />
          )}
          <div className="absolute inset-0 bg-white/65" />
        </div>
      )}

      <div className="relative z-10 flex w-full flex-col items-center justify-center gap-4">
        <div className="flex w-full items-start justify-center gap-3">
          <div className="min-w-0 text-center">
            {file ? (
              <>
                <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-gray-700">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </>
            ) : (
              <>
                <UploadCloud className="mx-auto mb-3 h-9 w-9 text-spruce" aria-hidden="true" />
                <span className="block text-sm font-semibold text-ink">
                  {inputMode === INPUT_MODE_READY ? 'Pilih file SVG vector murni' : 'Pilih gambar JPG, PNG, atau WebP'}
                </span>
                <span className="mt-1 block text-xs text-gray-600">
                  {inputMode === INPUT_MODE_READY
                    ? 'Maksimal 10 MB. Jalur ini khusus SVG murni untuk separasi warna dan contour sticker.'
                    : 'Maksimal 10 MB. Gambar akan dirapikan sebelum diproses AI.'}
                </span>
              </>
            )}
          </div>
        </div>

        {file && (
          <div className="flex w-full justify-center">
            <div className="checkerboard flex max-h-56 w-full max-w-80 items-center justify-center overflow-hidden border border-line bg-white/75 p-3 shadow-sm">
              <div className="flex w-full flex-col items-center gap-2 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-spruce">Preview terunggah</p>
                <p className="text-sm text-gray-700">Klik area ini untuk mengganti gambar.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {file && (
        <button
          type="button"
          className="absolute right-4 top-4 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-white text-gray-700 hover:border-tomato hover:text-tomato"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setPreviewFailed(false);
            setUploadError('');
            onFileChange(null);
          }}
          title="Hapus gambar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <input className="sr-only" type="file" accept={activeOption.accept} onChange={handleChange} disabled={disabled} />
    </label>
  );

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <ImagePlus className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Upload gambar</h2>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {modeOptions.map((option) => {
          const isActive = option.value === inputMode;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onInputModeChange(option.value)}
              className={`border px-3 py-2.5 text-left transition ${
                isActive ? 'border-spruce bg-primary/5 shadow-sm' : 'border-line bg-white hover:border-spruce/50'
              } disabled:opacity-60`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-ink">{option.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-gray-700">{option.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-black text-spruce">{formatRupiah(option.priceIdr)}/gambar</p>
                  <p className="text-[11px] text-gray-600">{option.badge}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-spruce/30 bg-primary/5 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-spruce">Mode aktif</p>
          <p className="text-xs text-gray-700">
            <span className="font-semibold text-ink">{activeOption.title}</span>
            {' - '}
            {activeOption.helper}
          </p>
        </div>
        {file && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setUploadError('');
              setPreviewFailed(false);
              onFileChange(null);
            }}
            className="inline-flex min-h-8 items-center justify-center border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-spruce disabled:opacity-60"
          >
            Kosongkan file
          </button>
        )}
      </div>

      {showRasterGuidelines && (
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
          <div className="border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Saran foto untuk AI redraw</p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">
              <li>Kamera Android minimal 16 MP.</li>
              <li>Ambil foto di tempat dengan cahaya cukup dan tanpa bayangan di area logo.</li>
              <li>Pastikan gambar tidak blur dan logo terlihat jelas.</li>
              <li>Jangan gunakan efek, filter, atau mode beautify kamera.</li>
              <li>Jangan gunakan zoom optik atau zoom digital saat memotret logo.</li>
            </ul>
          </div>
          {uploadZone}
        </div>
      )}

      {!showRasterGuidelines && uploadZone}

      {!isValidType && <p className="mt-3 text-sm text-tomato">{uploadError}</p>}
      {!isValidSize && <p className="mt-3 text-sm text-tomato">Ukuran file maksimal 10 MB.</p>}
      <p className="mt-3 text-xs text-gray-600">
        {inputMode === INPUT_MODE_READY
          ? 'Vector Siap Proses dipakai untuk file vector murni yang akan dipisah warna dan dibuat contour sticker.'
          : 'Jika foto terlalu gelap, blur, atau banyak bayangan, hasil redraw bisa tetap meleset dan perlu upload ulang.'}
      </p>
    </section>
  );
}
