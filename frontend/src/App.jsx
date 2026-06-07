import { Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AccountPanel from './components/AccountPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import BillingPanel from './components/BillingPanel.jsx';
import JobLibraryPanel from './components/JobLibraryPanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import LandingPage, { AboutPage, ContactPage, PrivacyPage, TermsPage } from './components/LandingPage.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { commitJob, deleteCloudJob, getBalance, listExampleJobs, quoteJob, requestImageRetouch, toUserApiError, uploadExampleArtifacts } from './lib/api.js';
import { createNormalizedImagePreviewBlob } from './lib/imagePreview.js';
import { deleteHistoryJob, loadHistoryJobs, releaseHistoryJobs, saveHistoryJob } from './lib/localHistoryStore.js';
import { processImageLocally } from './lib/localProcessor.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from './lib/modes.js';
import { IMAGE_RETOUCH_PRICE_IDR, calculateJobPrice, formatRupiah } from './lib/pricing.js';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const SUPERUSER_ACCOUNT = ['jho.j80@gm', 'a', 'il.com'].join('');
const FALLBACK_SESSION_STORAGE_KEY = 'designmudah.supabaseFallbackSession';
const LEGAL_PATHS = new Set(['/privacy', '/terms', '/contact', '/about']);

function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === '' ? '/' : trimmed;
}

function getPublicRouteFromPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/privacy') return 'privacy';
  if (normalized === '/terms') return 'terms';
  if (normalized === '/contact') return 'contact';
  if (normalized === '/about') return 'about';
  return 'landing';
}

function getDocumentTitle(route, hasSession) {
  if (route === 'privacy') return 'Kebijakan Privasi - AI Logo Redesign';
  if (route === 'terms') return 'Syarat dan Ketentuan - AI Logo Redesign';
  if (route === 'contact') return 'Hubungi Kami - AI Logo Redesign';
  if (route === 'about') return 'Tentang Kami - AI Logo Redesign';
  if (hasSession) return 'Design Mudah - Sablon dan Sticker';
  return 'AI Logo Redesign - Transformasi Logo Kaos';
}

const initialSettings = {
  projectName: '',
  productionType: 'sablon',
  inputMode: INPUT_MODE_RETOUCH,
  makeVector: true,
  separateColors: true,
  colorLimitMode: 'auto',
  maxColors: 4,
  whiteAsBackground: false,
  removeBackground: true,
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
      aiRedraw: job.manifest?.aiRedraw || null,
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

function getAuthCallbackParams() {
  return {
    hashParams: new URLSearchParams(window.location.hash.replace(/^#/, '')),
    queryParams: new URLSearchParams(window.location.search.replace(/^\?/, ''))
  };
}

function cleanAuthCallbackUrl() {
  if (!window.location.hash && !window.location.search) return;
  window.history.replaceState({}, document.title, window.location.pathname || '/');
}

function decodeBase64UrlJson(value) {
  if (!value) return null;
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = window.atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function buildFallbackSession(accessToken, refreshToken, params) {
  const claims = decodeBase64UrlJson(accessToken.split('.')[1]);
  if (!claims?.sub) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(params.get('expires_at') || claims.exp || now + Number(params.get('expires_in') || 3600));
  if (expiresAt <= now) return null;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get('token_type') || 'bearer',
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - now),
    user: {
      id: claims.sub,
      aud: claims.aud || 'authenticated',
      role: claims.role || 'authenticated',
      email: claims.email || '',
      phone: claims.phone || '',
      app_metadata: claims.app_metadata || {},
      user_metadata: claims.user_metadata || {},
      created_at: claims.iat ? new Date(claims.iat * 1000).toISOString() : '',
      updated_at: ''
    }
  };
}

function saveFallbackSession(session) {
  try {
    window.localStorage.setItem(FALLBACK_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
}

function loadFallbackSession() {
  try {
    const raw = window.localStorage.getItem(FALLBACK_SESSION_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.access_token || !session?.user?.id) return null;
    if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(FALLBACK_SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearFallbackSession() {
  try {
    window.localStorage.removeItem(FALLBACK_SESSION_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
}

export default function App() {
  const [file, setFile] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState('');
  const [authCallbackError, setAuthCallbackError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [view, setView] = useState('app');
  const previewRef = useRef('');
  const historyJobsRef = useRef([]);
  const [historyJobs, setHistoryJobs] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [exampleJobs, setExampleJobs] = useState([]);
  const [exampleError, setExampleError] = useState('');
  const [deletingLibraryJobId, setDeletingLibraryJobId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [publicRoute, setPublicRoute] = useState(() => getPublicRouteFromPathname(window.location.pathname || '/'));

  useEffect(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = '';
    }

    if (!file) {
      setPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      if (previewRef.current === url) previewRef.current = '';
    };
  }, [file]);

  useEffect(() => {
    const handlePopState = () => {
      setPublicRoute(getPublicRouteFromPathname(window.location.pathname || '/'));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = getDocumentTitle(publicRoute, Boolean(session));
  }, [publicRoute, session]);

  function navigatePublicPath(path, { replace = false } = {}) {
    const normalized = normalizePathname(path);
    if (replace) {
      window.history.replaceState({}, '', normalized);
    } else {
      window.history.pushState({}, '', normalized);
    }
    setPublicRoute(getPublicRouteFromPathname(normalized));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let isMounted = true;

    async function bootstrapAuth() {
      try {
        const { hashParams, queryParams } = getAuthCallbackParams();
        const callbackError =
          hashParams.get('error_description') ||
          queryParams.get('error_description') ||
          hashParams.get('error') ||
          queryParams.get('error');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (callbackError) {
          if (isMounted) setAuthCallbackError(callbackError);
          cleanAuthCallbackUrl();
          return;
        }

        if (accessToken && refreshToken) {
          const fallbackSession = buildFallbackSession(accessToken, refreshToken, hashParams);
          let result;
          try {
            result = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
          } catch (error) {
            cleanAuthCallbackUrl();
            if (!isMounted) return;
            if (fallbackSession) {
              saveFallbackSession(fallbackSession);
              setAuthCallbackError('');
              setSession(fallbackSession);
              setView('app');
              return;
            }
            throw error;
          }
          const { data, error } = result;
          cleanAuthCallbackUrl();
          if (!isMounted) return;
          if (error) {
            if (fallbackSession) {
              saveFallbackSession(fallbackSession);
              setAuthCallbackError('');
              setSession(fallbackSession);
              setView('app');
              return;
            }
            setAuthCallbackError(error.message || 'Login Google gagal diproses.');
            return;
          }
          setAuthCallbackError('');
          clearFallbackSession();
          setSession(data.session || null);
          if (data.session) setView('app');
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        const fallbackSession = loadFallbackSession();
        if (error) {
          if (!fallbackSession) setAuthCallbackError(error.message || 'Session login tidak bisa dibaca.');
        } else {
          setAuthCallbackError('');
        }
        const nextSession = data.session || fallbackSession;
        setSession(nextSession || null);
        if (nextSession) setView('app');
      } catch (error) {
        cleanAuthCallbackUrl();
        if (isMounted) {
          const fallbackSession = loadFallbackSession();
          if (fallbackSession) {
            setAuthCallbackError('');
            setSession(fallbackSession);
            setView('app');
          } else {
            setAuthCallbackError(error instanceof Error ? error.message : 'Login Google gagal diproses.');
          }
        }
      }
    }

    bootstrapAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        clearFallbackSession();
        setSession(nextSession);
        setAuthCallbackError('');
        setView('app');
      } else if (event === 'SIGNED_OUT') {
        clearFallbackSession();
        setSession(null);
      }
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
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

  async function refreshExampleJobs(activeSession = session) {
    if (!activeSession?.access_token) {
      setExampleJobs([]);
      setExampleError('');
      return;
    }

    try {
      setExampleError('');
      const data = await listExampleJobs(activeSession.access_token);
      setExampleJobs(Array.isArray(data.exampleJobs) ? data.exampleJobs : []);
    } catch (error) {
      setExampleError(toUserApiError(error, 'Contoh pekerjaan belum bisa dimuat saat ini.').message);
      setExampleJobs([]);
    }
  }

  useEffect(() => {
    refreshBalance(session);
  }, [session?.access_token]);

  useEffect(() => {
    refreshHistory(session);
  }, [session?.user?.id]);

  useEffect(() => {
    if (view !== 'app') return;
    refreshExampleJobs(session);
  }, [session?.access_token, session?.user?.id, view]);

  useEffect(() => {
    return () => {
      releaseHistoryJobs(historyJobsRef.current);
      historyJobsRef.current = [];
    };
  }, []);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    clearFallbackSession();
    setSession(null);
    setBalance(null);
    setJob(null);
    setView('app');
    replaceHistoryJobs([]);
    setHistoryError('');
    setExampleJobs([]);
    setExampleError('');
    setDeletingLibraryJobId('');
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
      let aiRedrawMetadata = null;

      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        setJob(statusJob('processing_image', 'Menggambar ulang gambar tanpa penyimpanan permanen server.', 25));
        const retouchResult = await requestImageRetouch(file, settings, session.access_token);
        processingFile = retouchResult.file;
        retouchLedgerId = retouchResult.retouchLedgerId;
        aiRedrawMetadata = retouchResult.aiRedrawMetadata || null;
      }

      setJob(statusJob('vectorizing', 'Membuat vector, cutline, film, PDF, dan ZIP di browser.', 60));
      const localResult = await processImageLocally(processingFile, settings);
      const manifest = {
        ...(localResult.manifest || {}),
        aiRedraw: aiRedrawMetadata
      };
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
          manifest,
          aiLedgerId: retouchLedgerId,
          priceIdr: finalPrice
        },
        session.access_token
      );

      const completedJob = {
        ...localResult,
        manifest,
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
  const isSuperuser = ['superuser', 'superadmin'].includes(balance?.profile?.role) || isWhitelistedSuperadmin;

  async function handleDeleteLibraryJob(item) {
    if (!item?.canDelete) return;
    const deleteMessage = item.isExample
      ? 'Hapus job contoh ini? Publikasi contoh akan dicabut dan artefak bucket akan dibersihkan.'
      : 'Hapus job ini dari riwayat perangkat dan metadata server? Jika ingin menjadikannya contoh, publish dulu sebelum menghapus.';
    if (!window.confirm(deleteMessage)) return;
    setDeletingLibraryJobId(item.id || item.jobId || '');
    setHistoryError('');
    setExampleError('');
    try {
      let localWarning = '';
      if (item.isExamplePublic) {
        await deleteCloudJob(item.jobId, session?.access_token);
      } else if (item.jobId && session?.access_token) {
        try {
          await deleteCloudJob(item.jobId, session.access_token);
        } catch (_error) {
          localWarning = 'Riwayat lokal dihapus, tetapi metadata server belum berhasil dibersihkan.';
        }
      }

      if (item.localRecordId) {
        await deleteHistoryJob(item.localRecordId);
      }

      await refreshHistory();
      if (item.isExamplePublic) {
        await refreshExampleJobs();
      }
      if (localWarning) {
        setHistoryError(localWarning);
      }
    } catch (error) {
      const message = toUserApiError(error, item.isExamplePublic ? 'Gagal menghapus job contoh.' : 'Gagal menghapus riwayat job.').message;
      if (item.isExamplePublic) {
        setExampleError(message);
      } else {
        setHistoryError(message);
      }
    } finally {
      setDeletingLibraryJobId('');
    }
  }

  const currentPathname = normalizePathname(window.location.pathname || '/');
  if (LEGAL_PATHS.has(currentPathname)) {
    if (publicRoute === 'privacy') return <PrivacyPage onNavigate={navigatePublicPath} />;
    if (publicRoute === 'terms') return <TermsPage onNavigate={navigatePublicPath} />;
    if (publicRoute === 'contact') return <ContactPage onNavigate={navigatePublicPath} />;
    if (publicRoute === 'about') return <AboutPage onNavigate={navigatePublicPath} />;
  }

  return (
    <main className="min-h-screen gradient-bg-subtle">
      {session && (
        <div className="glass-nav">
          <div className="mx-auto flex max-w-6xl justify-end px-4 py-5 sm:px-6">
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
          </div>
        </div>
      )}

      {!session && (
        <>
          <LandingPage
            onStart={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}
            authPanel={<AuthPanel onSignedIn={setSession} />}
            onNavigate={navigatePublicPath}
          />
          {authCallbackError && (
            <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
              <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {authCallbackError}
              </p>
            </div>
          )}
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
            <JobLibraryPanel
              historyJobs={historyJobs}
              exampleJobs={exampleJobs}
              historyError={historyError}
              exampleError={exampleError}
              onDeleteJob={handleDeleteLibraryJob}
              deletingJobId={deletingLibraryJobId}
              currentUserId={session.user.id}
            />
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
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
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
