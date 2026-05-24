import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

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

export default function JobStatus({ job, error }) {
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
          <div className="mt-3 h-2 overflow-hidden bg-panel">
            <div className={`h-full ${isFailed ? 'bg-tomato' : 'bg-spruce'}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
