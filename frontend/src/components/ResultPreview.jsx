import { Archive, Download, FileImage, FileText, Layers, Palette, Scissors, Trash2 } from 'lucide-react';
import { absoluteUrl } from '../lib/api.js';
import { INPUT_MODE_READY } from '../lib/modes.js';

function DownloadButton({ href, children, icon: Icon }) {
  if (!href) return null;
  return (
    <a
      href={absoluteUrl(href)}
      download
      className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

function PreviewCard({ title, icon: Icon, src, alt, notice }) {
  if (!src) return null;

  return (
    <div className="border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon className="h-4 w-4 text-spruce" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {notice && <p className="border-b border-line bg-panel px-3 py-2 text-xs text-gray-700">{notice}</p>}
      <div className="checkerboard flex min-h-72 items-center justify-center p-3">
        <img className="max-h-80 max-w-full object-contain" src={absoluteUrl(src)} alt={alt} />
      </div>
    </div>
  );
}

export default function ResultPreview({
  job,
  sourcePreviewUrl = '',
  sourcePreviewLabel = 'Preview gambar awal',
  heading = 'Download hasil',
  subheading = '',
  onDelete,
  isDeleting = false,
  showDelete = true,
  historyView = false
}) {
  if (!job || job.status !== 'done') return null;
  const files = job.files || {};
  const settings = job.settings || {};
  const isVectorReadyMode = settings.inputMode === INPUT_MODE_READY;
  const showFullColorDownloads = !(historyView && isVectorReadyMode);
  const showStickerCutlinePreview = historyView && isVectorReadyMode && settings.productionType === 'sticker';
  const showSeparationPreviewTitle = historyView && isVectorReadyMode && settings.productionType === 'sablon';

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Download className="h-5 w-5 text-spruce" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-ink">{heading}</h2>
          {(subheading || settings.projectName) && <p className="text-xs text-gray-600">{subheading || settings.projectName}</p>}
        </div>
      </div>

      {!isVectorReadyMode && (
        <div className="grid gap-4 xl:grid-cols-3">
          <PreviewCard title={sourcePreviewLabel} icon={FileImage} src={sourcePreviewUrl} alt={sourcePreviewLabel} />
          <PreviewCard
            title="Preview PNG hasil jadi"
            icon={FileImage}
            src={files.fullPng}
            alt="Preview PNG hasil jadi"
            notice={
              settings.removeBackground && settings.includeBackgroundInFilmSize !== true
                ? `Ukuran cetak: objek utama ${settings.actualWidthCm} cm, background dihilangkan. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                : settings.separateColors || settings.stickerCutlineEnabled
                  ? `Ukuran cetak: lebar ${settings.separateColors && settings.includeBackgroundInFilmSize ? 'termasuk background' : 'area artwork'} ${settings.actualWidthCm} cm, tinggi mengikuti rasio. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                  : ''
            }
          />
          <PreviewCard title="Preview SVG full color" icon={FileText} src={files.fullSvg} alt="Preview SVG full color" />
        </div>
      )}

      {isVectorReadyMode && (
        <>
          <div className="border border-line bg-panel px-3 py-2 text-sm text-gray-700">
            Mode Vector Siap Proses menampilkan hasil produksi utama agar halaman tetap ringkas.
          </div>
          {showStickerCutlinePreview && (
            <div className="mt-4 grid gap-4">
              <PreviewCard
                title="Preview cutting sticker"
                icon={Scissors}
                src={files.stickerCutlineSvg}
                alt="Preview cutting sticker"
                notice={`Ukuran cetak: area sticker ${settings.actualWidthCm} cm. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`}
              />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {showFullColorDownloads && (
          <DownloadButton href={files.fullPng} icon={FileImage}>
            Download PNG
          </DownloadButton>
        )}
        {showFullColorDownloads && (
          <DownloadButton href={files.fullSvg} icon={FileText}>
            Download SVG full color
          </DownloadButton>
        )}
        {showFullColorDownloads && (
          <DownloadButton href={files.fullPdf} icon={FileText}>
            Download PDF full color
          </DownloadButton>
        )}
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
        {showDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex min-h-10 items-center justify-center gap-2 border border-tomato bg-white px-3 py-2 text-sm font-semibold text-tomato transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>{isDeleting ? 'Menghapus' : 'Hapus hasil'}</span>
          </button>
        )}
      </div>

      {files.separations?.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-5 w-5 text-spruce" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">{showSeparationPreviewTitle ? 'Preview separasi warna' : 'Daftar film sablon'}</h3>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
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
                {(film.preview || film.previewPng || film.svg) && (
                  <div className="checkerboard mt-3 flex min-h-52 items-center justify-center border border-line bg-white p-3">
                    <img
                      className="max-h-64 max-w-full object-contain"
                      src={absoluteUrl(film.preview || film.previewPng || film.svg)}
                      alt={`Preview ${film.label}`}
                    />
                  </div>
                )}
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
