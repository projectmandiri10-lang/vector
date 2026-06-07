import { Archive, Download, FileText, Layers, RefreshCw, Trash2 } from 'lucide-react';
import { absoluteUrl } from '../lib/api.js';

function ArchiveButton({ href, children, icon: Icon }) {
  if (!href) return null;
  return (
    <a
      href={absoluteUrl(href)}
      download
      className="inline-flex min-h-9 items-center justify-center gap-2 border border-spruce bg-white px-2.5 py-1.5 text-xs font-semibold text-spruce transition hover:bg-primary/5"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

export default function ArchivePanel({ jobs, onRefresh, onOpenJob, onDeleteJob, isLoading, deletingJobId }) {
  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Arsip hasil</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-9 w-9 items-center justify-center border border-line bg-white text-gray-700 hover:border-spruce hover:text-spruce disabled:opacity-60"
          title="Muat ulang arsip"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-600">Belum ada hasil di arsip.</p>
      ) : (
        <div className="grid gap-3">
          {jobs.map((archiveJob) => {
            const files = archiveJob.files || {};
            const isDone = archiveJob.status === 'done';
            return (
              <article key={archiveJob.jobId} className="border border-line bg-panel p-3">
                <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <button
                    type="button"
                    onClick={() => onOpenJob(archiveJob.jobId)}
                    className="checkerboard flex h-24 w-24 items-center justify-center overflow-hidden border border-line bg-white"
                    title="Buka preview"
                  >
                    {files.fullPng ? (
                      <img className="h-full w-full object-contain" src={absoluteUrl(files.fullPng)} alt="Preview arsip" />
                    ) : (
                      <FileText className="h-6 w-6 text-gray-500" aria-hidden="true" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{archiveJob.settings?.projectName || 'Project Vector'}</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {archiveJob.settings?.productionType === 'sablon' ? 'Sablon' : 'Sticker'} · {archiveJob.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteJob(archiveJob.jobId)}
                        disabled={deletingJobId === archiveJob.jobId || !['done', 'failed'].includes(archiveJob.status)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-tomato bg-white text-tomato hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Hapus arsip"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {archiveJob.error && <p className="mt-2 text-xs text-tomato">{archiveJob.error}</p>}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenJob(archiveJob.jobId)}
                        className="inline-flex min-h-9 items-center justify-center border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-spruce"
                      >
                        Preview
                      </button>
                      <ArchiveButton href={files.fullSvg} icon={FileText}>
                        SVG
                      </ArchiveButton>
                      <ArchiveButton href={files.separationZip} icon={Layers}>
                        Film
                      </ArchiveButton>
                      {isDone && (
                        <ArchiveButton href={files.zip} icon={Download}>
                          ZIP
                        </ArchiveButton>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
