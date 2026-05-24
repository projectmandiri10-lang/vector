import { Check, Palette, SlidersHorizontal } from 'lucide-react';

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 border px-3 py-3 text-left text-sm transition ${
        checked ? 'border-spruce bg-teal-50 text-ink' : 'border-line bg-white text-gray-700'
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

export default function SettingsPanel({ settings, onChange, disabled }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value });
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
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Nama project</span>
          <input
            value={settings.projectName}
            onChange={(event) => update('projectName', event.target.value)}
            disabled={disabled}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            placeholder="Contoh: Logo Kedai Kopi"
          />
        </label>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Jenis produksi</span>
          <div className="grid grid-cols-2 gap-2">
            {['sticker', 'sablon'].map((type) => (
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
          <Toggle checked={settings.makeVector} onChange={(value) => update('makeVector', value)} label="Buat versi vector" disabled={disabled || settings.separateColors} />
          <Toggle checked={settings.separateColors} onChange={setSeparateColors} label="Pecah warna untuk sablon" disabled={disabled} />
        </div>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <Palette className="h-4 w-4 text-spruce" aria-hidden="true" />
            Maksimal warna
          </span>
          <select
            value={settings.maxColors}
            onChange={(event) => update('maxColors', Number(event.target.value))}
            disabled={disabled}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
          >
            {[2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count} warna
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Background</legend>
          <div className="grid gap-2">
            <label className="flex cursor-pointer items-center gap-3 border border-line bg-white px-3 py-2.5 text-sm">
              <input
                type="radio"
                checked={settings.whiteAsBackground}
                onChange={() => update('whiteAsBackground', true)}
                disabled={disabled}
              />
              Putih dianggap background
            </label>
            <label className="flex cursor-pointer items-center gap-3 border border-line bg-white px-3 py-2.5 text-sm">
              <input
                type="radio"
                checked={!settings.whiteAsBackground}
                onChange={() => update('whiteAsBackground', false)}
                disabled={disabled}
              />
              Putih dianggap warna sablon sendiri
            </label>
          </div>
        </fieldset>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Kualitas AI</span>
          <div className="border border-spruce bg-teal-50 px-3 py-2.5 text-sm font-semibold text-ink">Standar</div>
        </div>

        {settings.separateColors && (
          <div className="border border-line bg-panel p-3">
            <p className="mb-3 text-sm font-semibold text-ink">Ukuran film sablon</p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Ukuran gambar aktual</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={settings.actualWidthCm}
                  onChange={(event) => update('actualWidthCm', event.target.value)}
                  disabled={disabled}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
                <span className="text-sm font-medium text-gray-700">cm</span>
              </div>
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
