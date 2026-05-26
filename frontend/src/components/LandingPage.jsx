import { ArrowRight, BadgeCheck, FileDown, PenTool, ShieldCheck } from 'lucide-react';
import { formatRupiah, READY_TRACE_PRICE_IDR } from '../lib/pricing.js';

export default function LandingPage({ onStart, authPanel }) {
  const features = [
    ['Tanpa storage server', 'Hasil dibuat di browser dan tetap di perangkat user.', ShieldCheck],
    ['Cutline dan film', 'Output sticker, underbase, dan separasi sablon otomatis.', FileDown],
    ['Kredit jelas', 'Siap proses Rp1.000, gambar ulang Rp5.000, film Rp1.000 per warna.', BadgeCheck],
    ['Gambar ulang saat perlu', 'Gambar rapi bisa langsung diproses tanpa biaya gambar ulang.', PenTool]
  ];

  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-spruce">Sticker dan sablon siap produksi</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
            Ubah gambar jadi file sticker & sablon siap produksi.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-700">
            Upload logo atau desain, pilih file siap proses atau gambar ulang otomatis, lalu download SVG, PDF, ZIP, cutline sticker, dan film separasi tanpa menyimpan file di server.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-spruce bg-spruce px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
            >
              Mulai dari {formatRupiah(READY_TRACE_PRICE_IDR)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-line bg-white px-5 py-3 text-sm font-bold text-ink transition hover:border-spruce"
            >
              Upload gambar siap proses
            </button>
          </div>
        </div>

        {authPanel && <div id="auth" className="lg:col-start-2 lg:row-start-1">{authPanel}</div>}

        <div className="grid gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2">
          {features.map(([title, copy, Icon]) => (
            <div key={title} className="border border-line bg-panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-5 w-5 text-spruce" aria-hidden="true" />
                <h2 className="text-sm font-bold text-ink">{title}</h2>
              </div>
              <p className="text-sm leading-6 text-gray-700">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
