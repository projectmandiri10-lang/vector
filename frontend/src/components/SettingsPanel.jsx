import { Check, Palette, SlidersHorizontal } from 'lucide-react';
import { INPUT_MODE_READY } from '../lib/modes.js';

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 border px-3 py-3 text-left text-sm transition ${
        checked ? 'border-spruce bg-primary/5 text-ink' : 'border-line bg-white text-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-spruce'}`}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="font-medium">{label}</span>
      <span className={`flex h-5 w-5 items-center justify-center border ${checked ? 'border-spruce bg-spruce text-white' : 'border-line bg-white'}`}>
        {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
    </button>
  );
}

export default function SettingsPanel({ settings, inputMode, onChange, disabled }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value });
  }

  function setRemoveBackground(value) {
    onChange({
      ...settings,
      removeBackground: value,
      includeBackgroundInFilmSize: value ? false : settings.includeBackgroundInFilmSize
    });
  }

  function setProductionType(productionType) {
    onChange({
      ...settings,
      productionType,
      separateColors: productionType === 'sablon',
      makeVector: productionType === 'sablon' ? true : settings.makeVector
    });
  }

  function setSeparateColors(value) {
    onChange({
      ...settings,
      separateColors: value,
      makeVector: value ? true : settings.makeVector
    });
  }

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Pengaturan produksi</h2>
      </div>

      <div className="space-y-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Jenis produksi</span>
          <div className="grid grid-cols-2 gap-2">
            {['sablon', 'sticker'].map((type) => (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => setProductionType(type)}
                className={`border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                  settings.productionType === type ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink hover:border-spruce'
                }`}
              >
                {type === 'sticker' ? 'Sticker' : 'Sablon'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Toggle
            checked={inputMode === INPUT_MODE_READY ? true : settings.makeVector}
            onChange={(value) => update('makeVector', value)}
            label={inputMode === INPUT_MODE_READY ? 'Vector only (otomatis)' : 'Buat versi vector'}
            disabled={disabled || settings.separateColors || inputMode === INPUT_MODE_READY}
          />
          <Toggle checked={settings.separateColors} onChange={setSeparateColors} label="Pecah warna untuk sablon" disabled={disabled} />
        </div>

        {inputMode === INPUT_MODE_READY && (
          <div className="border border-spruce bg-primary/5 px-3 py-2 text-xs leading-5 text-ink">
            Mode siap trace selalu menjalankan vector, pisah warna, dan contour sticker lewat jalur backend lokal.
          </div>
        )}

        <div className="border border-line bg-panel p-3">
          <Toggle
            checked={settings.removeBackground}
            onChange={setRemoveBackground}
            label="Hilangkan background"
            disabled={disabled}
          />
          <p className="mt-2 text-xs text-gray-600">
            Ukuran dan output difokuskan ke objek utama saja. Background yang terdeteksi akan diabaikan.
          </p>
        </div>

        <div>
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <Palette className="h-4 w-4 text-spruce" aria-hidden="true" />
            Jumlah warna
          </span>
          <div className="grid gap-2">
            <Toggle
              checked={settings.colorLimitMode === 'manual'}
              onChange={(value) => update('colorLimitMode', value ? 'manual' : 'auto')}
              label="Batasi jumlah warna"
              disabled={disabled}
            />
            {settings.colorLimitMode !== 'manual' && (
              <div className="border border-spruce bg-primary/5 px-3 py-2.5 text-sm font-semibold text-ink">Otomatis</div>
            )}
          </div>
          <select
            value={settings.maxColors}
            onChange={(event) => update('maxColors', Number(event.target.value))}
            disabled={disabled || settings.colorLimitMode !== 'manual'}
            className="mt-2 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce disabled:bg-gray-100 disabled:text-gray-500"
          >
            {[2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count} warna
              </option>
            ))}
          </select>
        </div>

        {settings.productionType === 'sticker' && (
          <div className="border border-line bg-panel p-3">
            <p className="mb-3 text-sm font-semibold text-ink">Output sticker</p>
            <Toggle
              checked={settings.stickerCutlineEnabled}
              onChange={(value) => update('stickerCutlineEnabled', value)}
              label="Buat garis potong sticker"
              disabled={disabled}
            />

            {settings.stickerCutlineEnabled && (
              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Lebar artwork horizontal</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.1"
                      value={settings.actualWidthCm}
                      onChange={(event) => update('actualWidthCm', event.target.value)}
                      onWheel={(event) => event.currentTarget.blur()}
                      disabled={disabled}
                      className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                    />
                    <span className="text-sm font-medium text-gray-700">cm</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600">Isi ukuran dari kiri ke kanan gambar, bukan tinggi.</p>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Jarak garis potong</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.1"
                      max="20"
                      step="0.1"
                      value={settings.stickerCutlineOffsetMm}
                      onChange={(event) => update('stickerCutlineOffsetMm', event.target.value)}
                      disabled={disabled}
                      className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                    />
                    <span className="text-sm font-medium text-gray-700">mm</span>
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">Ukuran kertas</span>
                    <select
                      value={settings.paperSize}
                      onChange={(event) => update('paperSize', event.target.value)}
                      disabled={disabled}
                      className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">Orientasi kertas</span>
                    <select
                      value={settings.paperOrientation}
                      onChange={(event) => update('paperOrientation', event.target.value)}
                      disabled={disabled}
                      className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {settings.separateColors && (
          <div className="border border-line bg-panel p-3">
            <p className="mb-3 text-sm font-semibold text-ink">Ukuran film sablon</p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Lebar gambar horizontal</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={settings.actualWidthCm}
                  onChange={(event) => update('actualWidthCm', event.target.value)}
                  onWheel={(event) => event.currentTarget.blur()}
                  disabled={disabled}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
                <span className="text-sm font-medium text-gray-700">cm</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-600">Yang diisi adalah lebar gambar dari sisi kiri ke kanan.</p>
            </label>

            <label className="mt-3 flex cursor-pointer items-center gap-3 border border-line bg-white px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={settings.includeBackgroundInFilmSize}
                disabled={disabled || settings.removeBackground}
                onChange={(event) => update('includeBackgroundInFilmSize', event.target.checked)}
              />
              Sertakan background dalam ukuran
            </label>

            <label className="mt-3 flex cursor-pointer items-center gap-3 border border-line bg-white px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={settings.createUnderbaseFilm}
                onChange={(event) => update('createUnderbaseFilm', event.target.checked)}
                disabled={disabled}
              />
              Buat film dasar untuk bahan gelap
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Ukuran kertas</span>
                <select
                  value={settings.paperSize}
                  onChange={(event) => update('paperSize', event.target.value)}
                  disabled={disabled}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Orientasi kertas</span>
                <select
                  value={settings.paperOrientation}
                  onChange={(event) => update('paperOrientation', event.target.value)}
                  disabled={disabled}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
