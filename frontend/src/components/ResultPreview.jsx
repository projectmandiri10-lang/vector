import { Archive, Download, FileImage, FileText, Layers, Palette, Scissors, Trash2 } from 'lucide-react';
import { absoluteUrl } from '../lib/api.js';

function DownloadButton({ href, children, icon: Icon }) {
  if (!href) return null;
  return (
    <a
      href={absoluteUrl(href)}
      download
      className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

export default function ResultPreview({ job, onDelete, isDeleting }) {
  if (!job || job.status !== 'done') return null;
  const files = job.files || {};
  const settings = job.settings || {};

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Download className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Download hasil</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {files.fullPng && (
          <div className="border border-line bg-white">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <FileImage className="h-4 w-4 text-spruce" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">Preview PNG full color</h3>
            </div>
            {(settings.separateColors || settings.stickerCutlineEnabled) && (
              <p className="border-b border-line bg-panel px-3 py-2 text-xs text-gray-700">
                Ukuran cetak: lebar {settings.separateColors && settings.includeBackgroundInFilmSize ? 'termasuk background' : 'area artwork'} {settings.actualWidthCm} cm,
                tinggi mengikuti rasio. Kertas {settings.paperSize} {settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.
              </p>
            )}
            <div className="checkerboard flex min-h-72 items-center justify-center p-3">
              <img className="max-h-80 max-w-full object-contain" src={absoluteUrl(files.fullPng)} alt="Preview PNG full color" />
            </div>
          </div>
        )}

        {files.fullSvg && (
          <div className="border border-line bg-white">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <FileText className="h-4 w-4 text-spruce" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">Preview SVG full color</h3>
            </div>
            <div className="checkerboard flex min-h-72 items-center justify-center p-3">
              <img className="max-h-80 max-w-full object-contain" src={absoluteUrl(files.fullSvg)} alt="Preview SVG full color" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <DownloadButton href={files.fullPng} icon={FileImage}>
          Download PNG
        </DownloadButton>
        <DownloadButton href={files.fullSvg} icon={FileText}>
          Download SVG full color
        </DownloadButton>
        <DownloadButton href={files.fullPdf} icon={FileText}>
          Download PDF full color
        </DownloadButton>
        <DownloadButton href={files.stickerCutlineSvg} icon={Scissors}>
          Download SVG sticker cutline
        </DownloadButton>
        <DownloadButton href={files.stickerCutlinePdf} icon={Scissors}>
          Download PDF sticker cutline
        </DownloadButton>
        <DownloadButton href={files.zip} icon={Archive}>
          Download ZIP semua file
        </DownloadButton>
        <DownloadButton href={files.separationZip} icon={Layers}>
          Download ZIP Film Sablon
        </DownloadButton>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-tomato bg-white px-3 py-2 text-sm font-semibold text-tomato transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>{isDeleting ? 'Menghapus' : 'Hapus hasil'}</span>
        </button>
      </div>

      {files.separations?.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-5 w-5 text-spruce" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">Daftar film sablon</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {files.separations.map((film) => (
              <div key={film.index} className="border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-7 w-7 border border-line" style={{ backgroundColor: film.hex }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{film.label}</p>
                      <p className="text-xs text-gray-600">
                        {film.kind === 'underbase' ? 'Film dasar hitam 100% untuk bahan gelap' : 'Film hitam 100% dengan registration mark'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DownloadButton href={film.svg} icon={FileText}>
                    SVG film
                  </DownloadButton>
                  <DownloadButton href={film.pdf} icon={FileText}>
                    PDF film
                  </DownloadButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
