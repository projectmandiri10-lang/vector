import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from 'lucide-react';
import { IMAGE_RETOUCH_PRICE_IDR, formatRupiah } from '../lib/pricing.js';

const labels = {
  uploaded: 'Gambar diterima',
  preprocessing: 'Sedang menyiapkan gambar',
  processing_ai: 'Sedang menggambar ulang',
  vectorizing: 'Sedang membuat vector',
  separating_colors: 'Sedang pecah warna',
  exporting: 'Sedang menyiapkan file download',
  done: 'Selesai',
  failed: 'Gagal memproses gambar'
};

export default function JobStatus({ job, error, suggestedInputMode, onUseSuggestedMode }) {
  if (!job && !error) return null;
  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed' || error;
  const progress = job?.progress || (isFailed ? 100 : 0);

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        {isFailed ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-tomato" aria-hidden="true" />
        ) : isDone ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-spruce" aria-hidden="true" />
        ) : (
          <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-spruce" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{error || labels[job?.status] || job?.message}</p>
          {job?.status && !error && labels[job.status] !== job?.message && (
            <p className="mt-1 text-sm text-gray-600">{labels[job.status]}</p>
          )}
          {job?.error && <p className="mt-1 text-sm text-tomato">Silakan coba lagi atau hubungi admin.</p>}
          {isFailed && suggestedInputMode === 'ai_redraw' && (
            <button
              type="button"
              onClick={onUseSuggestedMode}
              className="mt-3 inline-flex min-h-10 items-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white hover:bg-primary/90"
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {`Gunakan AI Redraw Premium ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}`}
            </button>
          )}
          <div className="mt-3 h-2 overflow-hidden bg-panel">
            <div className={`h-full ${isFailed ? 'bg-tomato' : 'bg-spruce'}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
