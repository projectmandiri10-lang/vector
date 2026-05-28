import { Archive, Clock3, Eye, FileImage, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getAppConfig } from '../lib/api.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import ResultPreview from './ResultPreview.jsx';

const productionLabels = {
  sablon: 'Sablon',
  sticker: 'Sticker'
};

const inputModeLabels = {
  [INPUT_MODE_READY]: 'Siap proses',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang'
};

function ExamplePreview({ label, src }) {
  if (!src) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="checkerboard flex h-20 items-center justify-center overflow-hidden border border-line bg-white p-2">
        <img className="h-full w-full object-contain" src={src} alt={label} loading="lazy" />
      </div>
    </div>
  );
}

function normalizeExampleEntry(type, entry) {
  if (!entry || typeof entry !== 'object') return null;

  const projectName = entry.projectName || `Contoh ${productionLabels[type] || type}`;
  const resultPreviewUrl = entry.resultPreviewUrl || entry.imageUrl || entry.files?.fullPng || '';
  const sourcePreviewUrl = entry.sourcePreviewUrl || '';

  return {
    id: `example-${type}`,
    kind: 'example',
    projectName,
    productionType: entry.productionType || type,
    inputMode: entry.inputMode || INPUT_MODE_READY,
    createdAt: entry.updatedAt || '',
    updatedAt: entry.updatedAt || '',
    sourcePreviewUrl,
    resultPreviewUrl,
    job: {
      jobId: entry.jobId || `example-${type}`,
      status: 'done',
      createdAt: entry.updatedAt || '',
      updatedAt: entry.updatedAt || '',
      settings: {
        projectName,
        productionType: entry.productionType || type,
        inputMode: entry.inputMode || INPUT_MODE_READY,
        actualWidthCm: entry.settings?.actualWidthCm || 10,
        paperSize: entry.settings?.paperSize || 'A4',
        paperOrientation: entry.settings?.paperOrientation || 'portrait',
        separateColors: Boolean(entry.files?.separationZip || entry.separations?.length),
        includeBackgroundInFilmSize: Boolean(entry.settings?.includeBackgroundInFilmSize),
        stickerCutlineEnabled: Boolean(entry.files?.stickerCutlineSvg || entry.files?.stickerCutlinePdf)
      },
      files: {
        fullPng: entry.files?.fullPng || resultPreviewUrl,
        fullSvg: entry.files?.fullSvg || '',
        fullPdf: entry.files?.fullPdf || '',
        stickerCutlineSvg: entry.files?.stickerCutlineSvg || '',
        stickerCutlinePdf: entry.files?.stickerCutlinePdf || '',
        zip: entry.files?.zip || '',
        separationZip: entry.files?.separationZip || '',
        separations: (entry.separations || []).map((separation) => ({
          index: separation.index,
          kind: separation.kind || 'color',
          hex: separation.hex || '#000000',
          label: separation.label || '',
          svg: separation.svg || '',
          pdf: separation.pdf || '',
          preview: separation.preview || separation.previewPng || separation.svg || ''
        }))
      }
    }
  };
}

function LibraryCard({ item, onOpen, onDelete }) {
  const productionLabel = productionLabels[item.productionType] || item.productionType;
  const inputLabel = inputModeLabels[item.inputMode] || item.inputMode;

  return (
    <article className="border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{item.projectName}</p>
          <p className="mt-1 text-xs text-gray-600">
            {productionLabel} · {inputLabel}
          </p>
          {item.updatedAt && <p className="mt-1 text-[11px] text-gray-500">{new Date(item.updatedAt).toLocaleString('id-ID')}</p>}
        </div>
        {item.kind === 'history' ? (
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="inline-flex h-9 w-9 items-center justify-center border border-tomato bg-white text-tomato transition hover:bg-orange-50"
            title="Hapus dari perangkat"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 border border-spruce bg-teal-50 px-2 py-1 text-[11px] font-semibold text-spruce">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Contoh
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ExamplePreview label="Sebelum" src={item.sourcePreviewUrl} />
        <ExamplePreview label="Sesudah" src={item.resultPreviewUrl || item.job?.files?.fullPng} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="inline-flex min-h-9 items-center justify-center gap-2 border border-spruce bg-white px-3 py-2 text-xs font-semibold text-spruce transition hover:bg-teal-50"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Lihat hasil
        </button>
      </div>
    </article>
  );
}

export default function JobLibraryPanel({ historyJobs, historyError = '', onDeleteHistoryJob }) {
  const [activeTab, setActiveTab] = useState('history');
  const [selectedId, setSelectedId] = useState('');
  const [exampleJobs, setExampleJobs] = useState([]);
  const [examplesError, setExamplesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAppConfig()
      .then((data) => {
        if (cancelled) return;
        const settings = data.settings?.example_jobs || {};
        const nextExamples = ['sticker', 'sablon']
          .map((type) => normalizeExampleEntry(type, settings?.[type]))
          .filter(Boolean);
        setExampleJobs(nextExamples);
        setExamplesError('');
      })
      .catch(() => {
        if (cancelled) return;
        setExampleJobs([]);
        setExamplesError('Contoh pekerjaan belum tersedia saat ini.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    if (activeTab === 'history') return historyJobs;
    return exampleJobs;
  }, [activeTab, exampleJobs, historyJobs]);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId('');
    }
  }, [items, selectedId]);

  async function handleDeleteHistory(item) {
    await onDeleteHistoryJob(item);
    if (selectedId === item.id) setSelectedId('');
  }

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Archive className="h-5 w-5 text-spruce" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-ink">Riwayat & contoh pekerjaan</h2>
          <p className="text-xs text-gray-600">Lihat job milik Anda di perangkat ini dan contoh job penuh dari superadmin.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-sm font-semibold ${activeTab === 'history' ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink'}`}
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Riwayat Saya
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('examples')}
          className={`inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-sm font-semibold ${activeTab === 'examples' ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink'}`}
        >
          <FileImage className="h-4 w-4" aria-hidden="true" />
          Contoh Pekerjaan
        </button>
      </div>

      {activeTab === 'history' && historyError && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{historyError}</p>}
      {activeTab === 'examples' && examplesError && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{examplesError}</p>}

      {items.length === 0 ? (
        <div className="border border-dashed border-line bg-panel px-4 py-6 text-sm text-gray-600">
          {activeTab === 'history' ? 'Belum ada riwayat job di browser ini.' : 'Belum ada contoh pekerjaan yang dipilih superadmin.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onOpen={(nextItem) => setSelectedId(nextItem.id)}
              onDelete={handleDeleteHistory}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="mt-4 border-t border-line pt-4">
          <ResultPreview
            job={selectedItem.job}
            sourcePreviewUrl={selectedItem.sourcePreviewUrl}
            sourcePreviewLabel={selectedItem.sourceFileName ? `Preview awal: ${selectedItem.sourceFileName}` : 'Preview gambar awal'}
            heading={selectedItem.kind === 'history' ? 'Detail riwayat job' : 'Detail contoh pekerjaan'}
            subheading={`${productionLabels[selectedItem.productionType] || selectedItem.productionType} · ${inputModeLabels[selectedItem.inputMode] || selectedItem.inputMode}`}
            showDelete={selectedItem.kind === 'history'}
            onDelete={selectedItem.kind === 'history' ? () => handleDeleteHistory(selectedItem) : undefined}
          />
        </div>
      )}
    </section>
  );
}
