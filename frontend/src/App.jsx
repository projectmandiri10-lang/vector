import { Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AccountPanel from './components/AccountPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import BillingPanel from './components/BillingPanel.jsx';
import JobLibraryPanel from './components/JobLibraryPanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import LandingPage from './components/LandingPage.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { commitJob, getBalance, quoteJob, requestImageRetouch, toUserApiError, uploadExampleArtifacts } from './lib/api.js';
import { createNormalizedImagePreviewBlob } from './lib/imagePreview.js';
import { deleteHistoryJob, loadHistoryJobs, releaseHistoryJobs, saveHistoryJob } from './lib/localHistoryStore.js';
import { processImageLocally } from './lib/localProcessor.js';
import { INPUT_MODE_RETOUCH } from './lib/modes.js';
import { IMAGE_RETOUCH_PRICE_IDR, calculateJobPrice, formatRupiah } from './lib/pricing.js';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const SUPERUSER_ACCOUNT = ['jho.j80@gm', 'a', 'il.com'].join('');

const initialSettings = {
  projectName: '',
  productionType: 'sablon',
  inputMode: INPUT_MODE_RETOUCH,
  makeVector: true,
  separateColors: true,
  colorLimitMode: 'auto',
  maxColors: 4,
  whiteAsBackground: true,
  aiQuality: 'standard',
  actualWidthCm: 10,
  includeBackgroundInFilmSize: false,
  stickerCutlineEnabled: true,
  stickerCutlineOffsetMm: 2,
  createUnderbaseFilm: true,
  paperSize: 'A4',
  paperOrientation: 'portrait'
};

function statusJob(status, message, progress = 0) {
  return {
    jobId: 'local-progress',
    status,
    progress,
    message
  };
}

function appendFileIfPresent(formData, key, blob, filename) {
  if (blob instanceof Blob) {
    formData.append(key, blob, filename);
  }
}

function buildExampleArtifactsFormData({ sourcePreviewBlob, sourceFileName, job }) {
  const artifacts = job.artifactBlobs || {};
  const formData = new FormData();

  appendFileIfPresent(formData, 'sourcePreview', sourcePreviewBlob, 'source-preview.png');
  appendFileIfPresent(formData, 'fullPng', artifacts.fullPng, 'preview-full-color.png');
  appendFileIfPresent(formData, 'fullSvg', artifacts.fullSvg, 'full-vector.svg');
  appendFileIfPresent(formData, 'fullPdf', artifacts.fullPdf, 'full-vector.pdf');
  appendFileIfPresent(formData, 'stickerCutlineSvg', artifacts.stickerCutlineSvg, 'sticker-cutline.svg');
  appendFileIfPresent(formData, 'stickerCutlinePdf', artifacts.stickerCutlinePdf, 'sticker-cutline.pdf');
  appendFileIfPresent(formData, 'zip', artifacts.zip, 'result.zip');
  appendFileIfPresent(formData, 'separationZip', artifacts.separationZip, 'separation-films.zip');

  (artifacts.separations || []).forEach((separation) => {
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    appendFileIfPresent(formData, 'separationSvg', separation.svgBlob, `film-${slug}.svg`);
    appendFileIfPresent(formData, 'separationPdf', separation.pdfBlob, `film-${slug}.pdf`);
    appendFileIfPresent(formData, 'separationPreview', separation.previewBlob, `film-${slug}-preview.png`);
  });

  formData.append(
    'manifest',
    JSON.stringify({
      projectName: job.settings?.projectName || 'Project Vector',
      productionType: job.settings?.productionType || 'sticker',
      inputMode: job.settings?.inputMode || 'ready_trace',
      settings: job.settings || {},
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      sourceFileName: sourceFileName || '',
      separations: (artifacts.separations || []).map((separation) => ({
        index: separation.index,
        kind: separation.kind || 'color',
        hex: separation.hex || '#000000',
        label: separation.label || ''
      }))
    })
  );

  return formData;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [view, setView] = useState('app');
  const previewRef = useRef('');
  const historyJobsRef = useRef([]);
  const [historyJobs, setHistoryJobs] = useState([]);
  const [historyError, setHistoryError] = useState('');

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

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) setView('app');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function refreshBalance(activeSession = session) {
    if (!activeSession?.access_token) return;
    try {
      setBalanceError('');
      setBalance(await getBalance(activeSession.access_token));
    } catch (error) {
      setBalanceError(toUserApiError(error, 'Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.').message);
    }
  }

  function replaceHistoryJobs(nextJobs) {
    releaseHistoryJobs(historyJobsRef.current);
    historyJobsRef.current = nextJobs;
    setHistoryJobs(nextJobs);
  }

  async function refreshHistory(activeSession = session) {
    const ownerId = activeSession?.user?.id;
    if (!ownerId) {
      replaceHistoryJobs([]);
      setHistoryError('');
      return;
    }

    try {
      setHistoryError('');
      replaceHistoryJobs(await loadHistoryJobs(ownerId));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Riwayat lokal tidak bisa dibaca di browser ini.');
      replaceHistoryJobs([]);
    }
  }

  useEffect(() => {
    refreshBalance(session);
  }, [session?.access_token]);

  useEffect(() => {
    refreshHistory(session);
  }, [session?.user?.id]);

  useEffect(() => {
    return () => {
      releaseHistoryJobs(historyJobsRef.current);
      historyJobsRef.current = [];
    };
  }, []);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setBalance(null);
    setJob(null);
    setView('app');
    replaceHistoryJobs([]);
    setHistoryError('');
  }

  async function ensureCanRun(estimatedFilmCount = 0) {
    if (!session?.access_token) throw new Error('Login dulu untuk memakai credit.');
    const quote = await quoteJob(
      {
        inputMode: settings.inputMode,
        productionType: settings.productionType,
        separationFilmCount: estimatedFilmCount,
        retouchAlreadyCharged: false
      },
      session.access_token
    );
    if (!quote.isUnlimited && quote.balance < quote.priceIdr) {
      throw new Error(`Saldo kurang. Perkiraan biaya ${formatRupiah(quote.priceIdr)}, saldo ${formatRupiah(quote.balance)}.`);
    }
    return quote;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setJobError('Upload gambar wajib diisi.');
      return;
    }

    setJobError('');
    setIsSubmitting(true);
    setJob(statusJob('preprocessing', 'Menyiapkan file lokal.', 10));

    try {
      let sourcePreviewBlob = null;
      try {
        sourcePreviewBlob = await createNormalizedImagePreviewBlob(file);
      } catch (_previewError) {
        sourcePreviewBlob = file;
      }
      await ensureCanRun(settings.separateColors ? 1 : 0);
      let processingFile = file;
      let retouchLedgerId = '';

      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        setJob(statusJob('processing_image', 'Menggambar ulang gambar tanpa penyimpanan permanen server.', 25));
        const retouchResult = await requestImageRetouch(file, settings, session.access_token);
        processingFile = retouchResult.file;
        retouchLedgerId = retouchResult.retouchLedgerId;
      }

      setJob(statusJob('vectorizing', 'Membuat vector, cutline, film, PDF, dan ZIP di browser.', 60));
      const localResult = await processImageLocally(processingFile, settings);
      const finalPrice = calculateJobPrice({
        inputMode: settings.inputMode,
        separationFilmCount: localResult.separationFilmCount,
        retouchAlreadyCharged: settings.inputMode === INPUT_MODE_RETOUCH
      });

      setJob(statusJob('exporting', 'Mencatat metadata job dan mendebit credit.', 88));
      const committed = await commitJob(
        {
          inputMode: settings.inputMode,
          productionType: settings.productionType,
          projectName: settings.projectName || 'Project Vector',
          separationFilmCount: localResult.separationFilmCount,
          settings,
          manifest: localResult.manifest,
          aiLedgerId: retouchLedgerId,
          priceIdr: finalPrice
        },
        session.access_token
      );

      const completedJob = {
        ...localResult,
        jobId: committed.job?.id || localResult.jobId,
        priceIdr: (settings.inputMode === INPUT_MODE_RETOUCH ? IMAGE_RETOUCH_PRICE_IDR : 0) + finalPrice,
        remoteJob: committed.job
      };

      setJob(completedJob);

      try {
        await saveHistoryJob({
          ownerId: session.user.id,
          ownerEmail: session.user.email || '',
          sourcePreviewBlob,
          sourceFileName: file.name,
          job: completedJob
        });
        await refreshHistory();
      } catch (historySaveError) {
        setHistoryError(historySaveError instanceof Error ? historySaveError.message : 'Riwayat lokal tidak bisa disimpan di browser ini.');
      }

      if (isSuperuser && committed.job?.id) {
        try {
          const artifactFormData = buildExampleArtifactsFormData({
            sourcePreviewBlob,
            sourceFileName: file.name,
            job: completedJob
          });
          await uploadExampleArtifacts(committed.job.id, artifactFormData, session.access_token);
        } catch (artifactError) {
          console.error('Failed to upload example artifacts', artifactError);
        }
      }

      await refreshBalance();
    } catch (submitError) {
      setJobError(toUserApiError(submitError, 'Gagal memproses gambar.').message);
      setJob(statusJob('failed', 'Gagal memproses gambar.', 100));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBusy = isSubmitting || (job && !['done', 'failed'].includes(job.status));
  const canSubmit = file && !isBusy && file.size <= 10 * 1024 * 1024 && session;
  const sessionEmail = session?.user?.email?.toLowerCase() || '';
  const isWhitelistedSuperadmin = sessionEmail === SUPERUSER_ACCOUNT;
  const isSuperuser = balance?.profile?.role === 'superuser' || isWhitelistedSuperadmin;

  async function handleDeleteHistory(item) {
    try {
      await deleteHistoryJob(item.id);
      await refreshHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Riwayat lokal gagal dihapus.');
    }
  }

  return (
    <main className="min-h-screen bg-panel">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-spruce">Design Mudah</p>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">Sablon dan Sticker</h1>
          </div>
          {session && (
            <nav className="flex flex-wrap gap-2">
              {['app', 'billing', 'admin'].map((item) =>
                item === 'admin' && !isSuperuser ? null : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    className={`border px-3 py-2 text-sm font-semibold ${view === item ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink'}`}
                  >
                    {item === 'app' ? 'App' : item === 'billing' ? 'Billing' : 'Admin'}
                  </button>
                )
              )}
            </nav>
          )}
        </div>
      </div>

      {!session && (
        <>
          <LandingPage
            onStart={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}
            authPanel={<AuthPanel onSignedIn={setSession} />}
          />
          <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
            <div className="border border-line bg-white p-4 sm:p-5">
              <h2 className="mb-2 text-lg font-bold text-ink">Alur singkat</h2>
              <div className="grid gap-3 text-sm leading-6 text-gray-700">
                <p>1. Login atau register.</p>
                <p>2. Upload gambar siap proses mulai Rp1.000, atau gunakan gambar ulang Rp5.000.</p>
                <p>3. Download hasil langsung dari browser. Server hanya menyimpan metadata dan credit.</p>
              </div>
            </div>
          </div>
        </>
      )}

      {session && view === 'billing' && (
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <BillingPanel session={session} />
          <AccountPanel session={session} balance={balance} balanceError={balanceError} onRefreshBalance={refreshBalance} onSignOut={signOut} />
        </div>
      )}

      {session && view === 'admin' && (
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <AdminPanel session={session} enabled={isSuperuser} />
        </div>
      )}

      {session && view === 'app' && (
        <form className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <AccountPanel session={session} balance={balance} balanceError={balanceError} onRefreshBalance={refreshBalance} onSignOut={signOut} />
            <UploadBox
              file={file}
              previewUrl={previewUrl}
              inputMode={settings.inputMode}
              onInputModeChange={(inputMode) => setSettings((current) => ({ ...current, inputMode }))}
              onFileChange={setFile}
              disabled={isBusy}
            />
            <JobLibraryPanel historyJobs={historyJobs} historyError={historyError} onDeleteHistoryJob={handleDeleteHistory} />
            <JobStatus job={job} error={jobError} />
            <ResultPreview
              job={job}
              sourcePreviewUrl={previewUrl}
              sourcePreviewLabel={file?.name ? `Preview awal: ${file.name}` : 'Preview gambar awal'}
              onDelete={() => setJob(null)}
              isDeleting={false}
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
              <span>{isBusy ? 'Sedang memproses' : 'Proses dan debit credit'}</span>
            </button>
          </aside>
        </form>
      )}
    </main>
  );
}
