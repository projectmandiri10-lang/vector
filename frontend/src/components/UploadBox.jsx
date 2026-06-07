import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import { formatRupiah, IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR } from '../lib/pricing.js';

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

const modeOptions = [
  {
    value: INPUT_MODE_READY,
    title: 'Gambar siap proses',
    description: 'Untuk PNG/JPG/WebP yang sudah rapi dan ingin langsung dibuat vector, cutline, atau pisah warna.',
    priceIdr: READY_PROCESS_PRICE_IDR
  },
  {
    value: INPUT_MODE_RETOUCH,
    title: 'Gambar perlu digambar ulang',
    description: 'Untuk foto buram, scan, atau logo yang perlu dirapikan sebelum diproses.',
    priceIdr: IMAGE_RETOUCH_PRICE_IDR
  }
];

export default function UploadBox({ file, previewUrl, inputMode, onInputModeChange, onFileChange, disabled }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const hasPreview = Boolean(file && previewUrl);

  function handleChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    setPreviewFailed(false);
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
              inputMode === option.value ? 'border-spruce bg-primary/5 text-ink' : 'border-line bg-white text-gray-700 hover:border-spruce'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            aria-pressed={inputMode === option.value}
          >
            <span className="block text-sm font-semibold">{option.title}</span>
            <span className="mt-1 block text-base font-black text-spruce">{formatRupiah(option.priceIdr)}/gambar</span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">{option.description}</span>
          </button>
        ))}
      </div>

      <label
        className={`relative flex min-h-56 cursor-pointer overflow-hidden border border-dashed px-4 py-6 text-center transition ${
          hasPreview ? 'border-spruce bg-white' : 'border-line bg-panel hover:border-spruce hover:bg-white'
        }`}
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

        <div className="relative z-10 flex w-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className={`min-w-0 ${file ? 'text-left' : 'text-center'}`}>
              {file ? (
                <>
                  <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
                  <p className="text-xs text-gray-700">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <UploadCloud className="mx-auto mb-3 h-9 w-9 text-spruce" aria-hidden="true" />
                  <span className="block text-sm font-semibold text-ink">Pilih gambar JPG, PNG, atau WebP</span>
                  <span className="mt-1 block text-xs text-gray-600">
                    {inputMode === INPUT_MODE_READY
                      ? 'Maksimal 10 MB. File langsung diproses tanpa gambar ulang.'
                      : 'Maksimal 10 MB. Gambar akan dirapikan sebelum diproses.'}
                  </span>
                </>
              )}
            </div>

            {file && (
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-white text-gray-700 hover:border-tomato hover:text-tomato"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPreviewFailed(false);
                  onFileChange(null);
                }}
                title="Hapus gambar"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {file && (
            <div className="mt-6 flex flex-1 items-end justify-center">
              <div className="checkerboard flex max-h-72 w-full items-center justify-center overflow-hidden border border-line bg-white/75 p-3 shadow-sm">
                <div className="flex w-full flex-col items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-spruce">Preview terunggah</p>
                  <p className="text-sm text-gray-700">Klik area ini untuk mengganti gambar.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} disabled={disabled} />
      </label>

      {!isValidType && <p className="mt-3 text-sm text-tomato">File hanya boleh JPG, PNG, atau WebP.</p>}
      {!isValidSize && <p className="mt-3 text-sm text-tomato">Ukuran file maksimal 10 MB.</p>}
      <p className="mt-3 text-xs text-gray-600">Untuk foto rumit, hasil pecah warna mungkin perlu dicek kembali.</p>
    </section>
  );
}
