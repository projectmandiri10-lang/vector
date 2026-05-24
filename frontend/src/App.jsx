import { Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ArchivePanel from './components/ArchivePanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { createJob, deleteJob, getJob, listJobs } from './lib/api.js';

const initialSettings = {
  projectName: '',
  productionType: 'sticker',
  makeVector: true,
  separateColors: false,
  maxColors: 4,
  whiteAsBackground: true,
  aiQuality: 'standard',
  actualWidthCm: 10,
  paperSize: 'A4',
  paperOrientation: 'portrait'
};

export default function App() {
  const [file, setFile] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveJobs, setArchiveJobs] = useState([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState('');
  const previewRef = useRef('');

  const previewUrl = useMemo(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (!file) {
      previewRef.current = '';
      return '';
    }
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    return url;
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function loadArchive() {
    setIsArchiveLoading(true);
    try {
      setArchiveJobs(await listJobs());
    } catch (archiveError) {
      setError(archiveError.message || 'Gagal membaca arsip job.');
    } finally {
      setIsArchiveLoading(false);
    }
  }

  useEffect(() => {
    loadArchive();
  }, []);

  useEffect(() => {
    if (!job?.jobId || ['done', 'failed'].includes(job.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const nextJob = await getJob(job.jobId);
        setJob(nextJob);
        setError('');
      } catch (pollError) {
        setError('Koneksi backend terputus sementara. Status akan dicoba lagi otomatis.');
      }
    }, 1800);

    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  const canSubmit = file && !isSubmitting && file.size <= 10 * 1024 * 1024;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError('Upload gambar wajib diisi.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    setJob(null);

    try {
      const created = await createJob(file, settings);
      setJob(created);
      const firstStatus = await getJob(created.jobId);
      setJob(firstStatus);
      loadArchive();
    } catch (submitError) {
      setError(submitError.message || 'Gagal memproses gambar');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteResult() {
    if (!job?.jobId) return;
    const confirmed = window.confirm('Hapus semua file hasil job ini dari server?');
    if (!confirmed) return;

    setIsDeleting(true);
    setError('');
    try {
      await deleteJob(job.jobId);
      setJob(null);
      setFile(null);
      await loadArchive();
    } catch (deleteError) {
      setError(deleteError.message || 'Gagal menghapus hasil.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleOpenArchivedJob(jobId) {
    try {
      setJob(await getJob(jobId));
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (openError) {
      setError(openError.message || 'Gagal membuka arsip.');
    }
  }

  async function handleDeleteArchivedJob(jobId) {
    const confirmed = window.confirm('Hapus job ini dari arsip dan server?');
    if (!confirmed) return;

    setDeletingJobId(jobId);
    try {
      await deleteJob(jobId);
      if (job?.jobId === jobId) setJob(null);
      await loadArchive();
    } catch (deleteError) {
      setError(deleteError.message || 'Gagal menghapus arsip.');
    } finally {
      setDeletingJobId('');
    }
  }

  const isBusy = isSubmitting || (job && !['done', 'failed'].includes(job.status));

  return (
    <main className="min-h-screen bg-panel">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-spruce">Redraw Vector</p>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">Sablon dan Sticker</h1>
          </div>
        </div>
      </div>

      <form className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <UploadBox file={file} previewUrl={previewUrl} onFileChange={setFile} />
          <JobStatus job={job} error={error} />
          <ResultPreview job={job} onDelete={handleDeleteResult} isDeleting={isDeleting} />
          <ArchivePanel
            jobs={archiveJobs}
            onRefresh={loadArchive}
            onOpenJob={handleOpenArchivedJob}
            onDeleteJob={handleDeleteArchivedJob}
            isLoading={isArchiveLoading}
            deletingJobId={deletingJobId}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <SettingsPanel settings={settings} onChange={setSettings} disabled={isBusy} />
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
          >
            <Wand2 className="h-5 w-5" aria-hidden="true" />
            <span>{isBusy ? 'Sedang memproses' : 'Proses gambar'}</span>
          </button>
        </aside>
      </form>
    </main>
  );
}
