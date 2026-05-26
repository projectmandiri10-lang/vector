import { Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AccountPanel from './components/AccountPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import BillingPanel from './components/BillingPanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import LandingPage from './components/LandingPage.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { commitJob, getBalance, quoteJob, requestAiRedraw } from './lib/api.js';
import { processImageLocally } from './lib/localProcessor.js';
import { INPUT_MODE_RETOUCH } from './lib/modes.js';
import { calculateJobPrice, formatRupiah } from './lib/pricing.js';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

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

export default function App() {
  const [file, setFile] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [view, setView] = useState('app');
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
      setBalance(await getBalance(activeSession.access_token));
    } catch (balanceError) {
      setError(balanceError.message || 'Gagal membaca saldo.');
    }
  }

  useEffect(() => {
    refreshBalance(session);
  }, [session?.access_token]);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setBalance(null);
    setJob(null);
    setView('app');
  }

  async function ensureCanRun(estimatedFilmCount = 0) {
    if (!session?.access_token) throw new Error('Login dulu untuk memakai credit.');
    const quote = await quoteJob(
      {
        inputMode: settings.inputMode,
        productionType: settings.productionType,
        separationFilmCount: estimatedFilmCount,
        aiAlreadyCharged: false
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
      setError('Upload gambar wajib diisi.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    setJob(statusJob('preprocessing', 'Menyiapkan file lokal.', 10));

    try {
      await ensureCanRun(settings.separateColors ? 1 : 0);
      let processingFile = file;
      let aiLedgerId = '';

      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        setJob(statusJob('processing_image', 'Menggambar ulang gambar tanpa penyimpanan permanen server.', 25));
        const aiResult = await requestAiRedraw(file, settings, session.access_token);
        processingFile = aiResult.file;
        aiLedgerId = aiResult.aiLedgerId;
      }

      setJob(statusJob('vectorizing', 'Membuat vector, cutline, film, PDF, dan ZIP di browser.', 60));
      const localResult = await processImageLocally(processingFile, settings);
      const finalPrice = calculateJobPrice({
        inputMode: settings.inputMode,
        separationFilmCount: localResult.separationFilmCount,
        aiAlreadyCharged: settings.inputMode === INPUT_MODE_RETOUCH
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
          aiLedgerId,
          priceIdr: finalPrice
        },
        session.access_token
      );

      setJob({
        ...localResult,
        jobId: committed.job?.id || localResult.jobId,
        priceIdr: (settings.inputMode === INPUT_MODE_RETOUCH ? 5000 : 0) + finalPrice,
        remoteJob: committed.job
      });
      await refreshBalance();
    } catch (submitError) {
      setError(submitError.message || 'Gagal memproses gambar.');
      setJob(statusJob('failed', 'Gagal memproses gambar.', 100));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBusy = isSubmitting || (job && !['done', 'failed'].includes(job.status));
  const canSubmit = file && !isBusy && file.size <= 10 * 1024 * 1024 && session;
  const isSuperuser = balance?.profile?.role === 'superuser';

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
          <BillingPanel />
          <AccountPanel session={session} balance={balance} onRefreshBalance={refreshBalance} onSignOut={signOut} />
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
            <AccountPanel session={session} balance={balance} onRefreshBalance={refreshBalance} onSignOut={signOut} />
            <UploadBox
              file={file}
              previewUrl={previewUrl}
              inputMode={settings.inputMode}
              onInputModeChange={(inputMode) => setSettings((current) => ({ ...current, inputMode }))}
              onFileChange={setFile}
              disabled={isBusy}
            />
            <JobStatus job={job} error={error} />
            <ResultPreview job={job} onDelete={() => setJob(null)} isDeleting={false} />
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
