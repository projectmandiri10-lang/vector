import { FileImage } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getAppConfig } from '../lib/api.js';

const productionCards = [
  ['sablon', 'Sablon'],
  ['sticker', 'Sticker']
];

function ExampleCard({ label, example, active }) {
  return (
    <article className={`border bg-white ${active ? 'border-spruce shadow-sm' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-gray-600">Contoh Gambar</p>
        </div>
        {active && <span className="border border-spruce bg-primary/5 px-2 py-1 text-xs font-semibold text-spruce">Sedang dipilih</span>}
      </div>

      {example?.imageUrl ? (
        <div className="checkerboard flex min-h-48 items-center justify-center bg-panel p-3">
          <img className="max-h-56 max-w-full object-contain" src={example.imageUrl} alt={`Contoh gambar ${label.toLowerCase()}`} loading="lazy" />
        </div>
      ) : (
        <div className="flex min-h-48 items-center justify-center bg-panel px-4 text-center text-sm text-gray-600">
          Contoh {label.toLowerCase()} belum dipilih admin.
        </div>
      )}
    </article>
  );
}

export default function ExampleJobsPanel({ activeProductionType }) {
  const [examples, setExamples] = useState({});

  useEffect(() => {
    let cancelled = false;
    getAppConfig()
      .then((data) => {
        if (!cancelled) setExamples(data.settings?.example_jobs || {});
      })
      .catch(() => {
        if (!cancelled) setExamples({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(
    () =>
      productionCards.map(([key, label]) => ({
        key,
        label,
        example: examples?.[key] || null
      })),
    [examples]
  );

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileImage className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Contoh Gambar</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <ExampleCard key={card.key} label={card.label} example={card.example} active={activeProductionType === card.key} />
        ))}
      </div>
    </section>
  );
}
