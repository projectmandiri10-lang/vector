import { Archive, Eye, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

function toSeparationFiles(separations = []) {
  return separations.map((separation) => ({
    index: separation.index,
    kind: separation.kind || 'color',
    hex: separation.hex || '#000000',
    label: separation.label || '',
    svg: separation.svg || '',
    pdf: separation.pdf || '',
    preview: separation.preview || separation.previewPng || separation.svg || ''
  }));
}

function sortTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeHistoryItem(item, currentUserId) {
  const job = item.job || {};
  const settings = job.settings || {};
  return {
    id: `history-${item.id}`,
    selectionKey: job.jobId || item.id,
    localRecordId: item.id,
    jobId: job.jobId || item.id,
    projectName: item.projectName || settings.projectName || 'Project Vector',
    productionType: item.productionType || settings.productionType || 'sticker',
    inputMode: item.inputMode || settings.inputMode || INPUT_MODE_READY,
    createdAt: item.createdAt || job.createdAt || '',
    updatedAt: item.updatedAt || job.updatedAt || item.createdAt || '',
    sourcePreviewUrl: item.sourcePreviewUrl || '',
    resultPreviewUrl: job.files?.fullPng || '',
    sourceFileName: item.sourceFileName || '',
    ownerId: currentUserId || '',
    isExample: false,
    isExamplePublic: false,
    canDelete: true,
    job: {
      ...job,
      settings,
      files: {
        ...(job.files || {}),
        separations: toSeparationFiles(job.files?.separations || [])
      }
    }
  };
}

function normalizeExampleItem(item, currentUserId) {
  if (!item || typeof item !== 'object') return null;
  const settings = item.settings || {};
  const projectName = item.projectName || settings.projectName || 'Contoh pekerjaan';
  const productionType = item.productionType || settings.productionType || 'sticker';
  const inputMode = item.inputMode || settings.inputMode || INPUT_MODE_READY;

  return {
    id: `example-${item.jobId}`,
    selectionKey: item.jobId || `example-${productionType}`,
    localRecordId: '',
    jobId: item.jobId || `example-${productionType}`,
    projectName,
    productionType,
    inputMode,
    createdAt: item.createdAt || item.updatedAt || '',
    updatedAt: item.updatedAt || item.createdAt || '',
    sourcePreviewUrl: item.sourcePreviewUrl || '',
    resultPreviewUrl: item.resultPreviewUrl || item.files?.fullPng || '',
    sourceFileName: '',
    ownerId: item.ownerId || '',
    isExample: true,
    isExamplePublic: item.isExamplePublic !== false,
    canDelete: Boolean(item.ownerId && currentUserId && item.ownerId === currentUserId),
    job: {
      jobId: item.jobId || `example-${productionType}`,
      status: 'done',
      createdAt: item.createdAt || item.updatedAt || '',
      updatedAt: item.updatedAt || item.createdAt || '',
      settings,
      files: {
        fullPng: item.files?.fullPng || item.resultPreviewUrl || '',
        fullSvg: item.files?.fullSvg || '',
        fullPdf: item.files?.fullPdf || '',
        stickerCutlineSvg: item.files?.stickerCutlineSvg || '',
        stickerCutlinePdf: item.files?.stickerCutlinePdf || '',
        zip: item.files?.zip || '',
        separationZip: item.files?.separationZip || '',
        separations: toSeparationFiles(item.separations || [])
      }
    }
  };
}

function mergeLibraryItems(localItem, exampleItem) {
  const localFiles = localItem.job?.files || {};
  const exampleFiles = exampleItem.job?.files || {};
  const sourcePreviewUrl = localItem.sourcePreviewUrl || exampleItem.sourcePreviewUrl;
  const resultPreviewUrl = exampleItem.resultPreviewUrl || localItem.resultPreviewUrl;

  return {
    ...localItem,
    ...exampleItem,
    id: `merged-${exampleItem.jobId}`,
    selectionKey: exampleItem.jobId || localItem.selectionKey,
    localRecordId: localItem.localRecordId,
    sourcePreviewUrl,
    resultPreviewUrl,
    sourceFileName: localItem.sourceFileName || '',
    isExample: true,
    isExamplePublic: true,
    canDelete: Boolean(localItem.canDelete || exampleItem.canDelete),
    job: {
      ...localItem.job,
      ...exampleItem.job,
      settings: {
        ...(localItem.job?.settings || {}),
        ...(exampleItem.job?.settings || {})
      },
      files: {
        ...localFiles,
        ...exampleFiles,
        separations: exampleFiles.separations?.length ? exampleFiles.separations : localFiles.separations || []
      }
    }
  };
}

function LibraryCard({ item, onOpen, onDelete, isDeleting }) {
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
        <div className="flex items-center gap-2">
          {item.isExample && (
            <span className="inline-flex items-center gap-1 border border-spruce bg-primary/5 px-2 py-1 text-[11px] font-semibold text-spruce">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Contoh
            </span>
          )}
          {item.canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              disabled={isDeleting}
              className="inline-flex h-9 w-9 items-center justify-center border border-tomato bg-white text-tomato transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={item.isExample ? 'Hapus job dan cabut publikasi contoh' : 'Hapus job'}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ExamplePreview label="Sebelum" src={item.sourcePreviewUrl} />
        <ExamplePreview label="Sesudah" src={item.resultPreviewUrl || item.job?.files?.fullPng} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="inline-flex min-h-9 items-center justify-center gap-2 border border-spruce bg-white px-3 py-2 text-xs font-semibold text-spruce transition hover:bg-primary/5"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Lihat hasil
        </button>
      </div>
    </article>
  );
}

export default function JobLibraryPanel({
  historyJobs,
  exampleJobs,
  historyError = '',
  exampleError = '',
  onDeleteJob,
  deletingJobId = '',
  currentUserId = '',
  selectedKey: controlledSelectedKey,
  onSelectedKeyChange
}) {
  const [internalSelectedKey, setInternalSelectedKey] = useState('');
  const selectedKey = controlledSelectedKey ?? internalSelectedKey;

  function setSelectedKey(nextKey) {
    if (typeof onSelectedKeyChange === 'function') {
      onSelectedKeyChange(nextKey);
      return;
    }
    setInternalSelectedKey(nextKey);
  }

  const items = useMemo(() => {
    const localItems = (historyJobs || []).map((item) => normalizeHistoryItem(item, currentUserId));
    const remoteItems = (exampleJobs || []).map((item) => normalizeExampleItem(item, currentUserId)).filter(Boolean);
    const merged = new Map();

    localItems.forEach((item) => {
      merged.set(item.selectionKey, item);
    });

    remoteItems.forEach((item) => {
      const existing = merged.get(item.selectionKey);
      merged.set(item.selectionKey, existing ? mergeLibraryItems(existing, item) : item);
    });

    return [...merged.values()].sort((left, right) => sortTimestamp(right.updatedAt || right.createdAt) - sortTimestamp(left.updatedAt || left.createdAt));
  }, [currentUserId, exampleJobs, historyJobs]);

  const selectedItem = useMemo(() => items.find((item) => item.selectionKey === selectedKey) || null, [items, selectedKey]);

  useEffect(() => {
    if (selectedKey && !items.some((item) => item.selectionKey === selectedKey)) {
      setSelectedKey('');
    }
  }, [items, selectedKey]);

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Archive className="h-5 w-5 text-spruce" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-ink">Riwayat job & contoh</h2>
          <p className="text-xs text-gray-600">Riwayat milik Anda di browser ini digabung dengan contoh job superadmin yang siap dibuka dan didownload.</p>
        </div>
      </div>

      {historyError && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{historyError}</p>}
      {exampleError && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{exampleError}</p>}

      {items.length === 0 ? (
        <div className="border border-dashed border-line bg-panel px-4 py-6 text-sm text-gray-600">
          Belum ada riwayat job di browser ini dan belum ada contoh pekerjaan yang dipublish.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onOpen={(nextItem) => setSelectedKey(nextItem.selectionKey)}
              onDelete={onDeleteJob}
              isDeleting={deletingJobId === item.id || deletingJobId === item.jobId}
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
            heading={selectedItem.isExample ? 'Detail contoh pekerjaan' : 'Detail riwayat job'}
            historyView={true}
            subheading={`${productionLabels[selectedItem.productionType] || selectedItem.productionType} · ${inputModeLabels[selectedItem.inputMode] || selectedItem.inputMode}`}
            showDelete={selectedItem.canDelete}
            onDelete={selectedItem.canDelete ? () => onDeleteJob(selectedItem) : undefined}
            isDeleting={deletingJobId === selectedItem.id || deletingJobId === selectedItem.jobId}
          />
        </div>
      )}
    </section>
  );
}
