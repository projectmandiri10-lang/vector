import { ArrowRight, BadgeCheck, FileDown, ShieldCheck, Sparkles } from 'lucide-react';
import { formatRupiah, READY_TRACE_PRICE_IDR } from '../lib/pricing.js';

export default function LandingPage({ onStart }) {
  return (
    <section className="bg-white">
      <div className="mx-auto grid min-h-[68vh] max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-spruce">Sticker dan sablon siap produksi</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
            Ubah gambar jadi file sticker & sablon siap produksi.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-700">
            Upload logo atau desain, pilih siap trace atau redraw AI, lalu download SVG, PDF, ZIP, cutline sticker, dan film separasi tanpa menyimpan file di server.
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
              Upload gambar siap trace
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {[
            ['Tanpa storage server', 'Hasil dibuat di browser dan tetap di perangkat user.', ShieldCheck],
            ['Cutline dan film', 'Output sticker, underbase, dan separasi sablon otomatis.', FileDown],
            ['Kredit jelas', 'Ready trace Rp1.000, AI Rp5.000, film Rp1.000 per warna.', BadgeCheck],
            ['AI saat perlu saja', 'Gambar rapi bisa langsung trace tanpa biaya AI.', Sparkles]
          ].map(([title, copy, Icon]) => (
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
