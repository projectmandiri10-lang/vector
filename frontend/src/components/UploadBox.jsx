import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import { formatRupiah, IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR } from '../lib/pricing.js';

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

const modeOptions = [
  {
    value: INPUT_MODE_RETOUCH,
    title: 'Gambar perlu digambar ulang',
    description: 'Untuk foto buram, scan, atau logo yang perlu dirapikan sebelum diproses.',
    priceIdr: IMAGE_RETOUCH_PRICE_IDR
  },
  {
    value: INPUT_MODE_READY,
    title: 'Gambar sudah siap proses',
    description: 'Untuk PNG/JPG/WebP yang sudah bersih dan ingin langsung diproses sticker atau sablon.',
    priceIdr: READY_PROCESS_PRICE_IDR
  }
];

export default function UploadBox({ file, previewUrl, inputMode, onInputModeChange, onFileChange, disabled }) {
  function handleChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    onFileChange(nextFile);
  }

  const isValidType = file ? acceptedTypes.includes(file.type) : true;
  const isValidSize = file ? file.size <= 10 * 1024 * 1024 : true;

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <ImagePlus className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Upload gambar</h2>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2">
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onInputModeChange(option.value)}
            className={`border px-3 py-3 text-left transition ${
              inputMode === option.value ? 'border-spruce bg-teal-50 text-ink' : 'border-line bg-white text-gray-700 hover:border-spruce'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            aria-pressed={inputMode === option.value}
          >
            <span className="block text-sm font-semibold">{option.title}</span>
            <span className="mt-1 block text-base font-black text-spruce">{formatRupiah(option.priceIdr)}/gambar</span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">{option.description}</span>
          </button>
        ))}
      </div>

      <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-panel px-4 py-8 text-center transition hover:border-spruce hover:bg-white">
        <UploadCloud className="mb-3 h-9 w-9 text-spruce" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink">Pilih gambar JPG, PNG, atau WebP</span>
        <span className="mt-1 text-xs text-gray-600">
          {inputMode === INPUT_MODE_READY
            ? 'Maksimal 10 MB. File langsung diproses tanpa gambar ulang.'
            : 'Maksimal 10 MB. Gambar akan dirapikan sebelum diproses.'}
        </span>
        <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} disabled={disabled} />
      </label>

      {file && (
        <div className="mt-4 border border-line bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-gray-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-line bg-white text-gray-700 hover:border-tomato hover:text-tomato"
              onClick={() => onFileChange(null)}
              title="Hapus gambar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {previewUrl && (
            <div className="checkerboard flex max-h-80 items-center justify-center overflow-hidden p-3">
              <img className="max-h-72 max-w-full object-contain" src={previewUrl} alt="Preview gambar asli" />
            </div>
          )}
        </div>
      )}

      {!isValidType && <p className="mt-3 text-sm text-tomato">File hanya boleh JPG, PNG, atau WebP.</p>}
      {!isValidSize && <p className="mt-3 text-sm text-tomato">Ukuran file maksimal 10 MB.</p>}
      <p className="mt-3 text-xs text-gray-600">Untuk foto rumit, hasil pecah warna mungkin perlu dicek kembali.</p>
    </section>
  );
}
