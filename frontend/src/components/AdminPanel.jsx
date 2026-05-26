import { BarChart3, BriefcaseBusiness, Check, CreditCard, RefreshCw, Save, Shield, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  addAdminCredit,
  approveManualPayment,
  getAdminOverview,
  listAdminJobs,
  listAdminManualPayments,
  listAdminPricingRules,
  listAdminSettings,
  listAdminUsers,
  rejectManualPayment,
  updateAdminPricingRule,
  updateAdminSetting,
  updateAdminUser
} from '../lib/api.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import { formatRupiah } from '../lib/pricing.js';

const pricingLabels = {
  [INPUT_MODE_READY]: 'Gambar siap proses',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang',
  separation_film: 'Film separasi'
};

const inputModeLabels = {
  [INPUT_MODE_READY]: 'Siap proses',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang'
};

function StatusBadge({ status }) {
  const styles = {
    pending: 'border-amber-300 bg-amber-50 text-amber-800',
    approved: 'border-spruce bg-teal-50 text-spruce',
    rejected: 'border-tomato bg-orange-50 text-tomato',
    done: 'border-spruce bg-teal-50 text-spruce',
    failed: 'border-tomato bg-orange-50 text-tomato'
  };
  return <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${styles[status] || 'border-line bg-panel text-gray-700'}`}>{status}</span>;
}

export default function AdminPanel({ session, enabled }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pricingRules, setPricingRules] = useState([]);
  const [settings, setSettings] = useState([]);
  const [amountByUser, setAmountByUser] = useState({});
  const [pricingDraft, setPricingDraft] = useState({});
  const [shopeeDraft, setShopeeDraft] = useState({ url: '', note: '', contact: '' });
  const [rejectReasonByPayment, setRejectReasonByPayment] = useState({});
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const accessToken = session?.access_token;

  async function loadAdminData() {
    if (!enabled || !accessToken) return;
    setIsBusy(true);
    setMessage('');
    try {
      const [overviewData, usersData, paymentsData, pricingData, settingsData, jobsData] = await Promise.all([
        getAdminOverview(accessToken),
        listAdminUsers(accessToken),
        listAdminManualPayments(accessToken),
        listAdminPricingRules(accessToken),
        listAdminSettings(accessToken),
        listAdminJobs(accessToken)
      ]);
      setOverview(overviewData.overview || null);
      setUsers(usersData.users || []);
      setPayments(paymentsData.payments || []);
      setPricingRules(pricingData.rules || []);
      setSettings(settingsData.settings || []);
      setJobs(jobsData.jobs || []);
      setPricingDraft(
        Object.fromEntries((pricingData.rules || []).map((rule) => [rule.key, { amountIdr: rule.amount_idr, description: rule.description || '', active: rule.active !== false }]))
      );
      const shopee = (settingsData.settings || []).find((setting) => setting.key === 'shopee_payment')?.value || {};
      setShopeeDraft({
        url: shopee.url || 'https://shopee.co.id/',
        note: shopee.note || '',
        contact: shopee.contact || ''
      });
    } catch (error) {
      setMessage(error.message || 'Gagal membaca data superadmin.');
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [enabled, accessToken]);

  const tabs = [
    ['overview', 'Ringkasan', BarChart3],
    ['users', 'User & credit', CreditCard],
    ['payments', 'Pembayaran', Check],
    ['pricing', 'Harga', SlidersHorizontal],
    ['settings', 'Setting aplikasi', Shield],
    ['jobs', 'Job', BriefcaseBusiness]
  ];

  const statCards = useMemo(
    () => [
      ['User aktif', overview?.activeUsers || 0],
      ['Job 7 hari', overview?.jobsLast7Days || 0],
      ['Payment pending', overview?.pendingPayments || 0],
      ['Nilai job', formatRupiah(overview?.totalJobValueIdr || 0)],
      ['Payment approve', formatRupiah(overview?.approvedPaymentIdr || 0)],
      ['Credit terpakai', formatRupiah(overview?.creditUsedIdr || 0)]
    ],
    [overview]
  );

  async function addCredit(userId) {
    const amount = Number.parseInt(amountByUser[userId] || '0', 10);
    if (!amount) return;
    setIsBusy(true);
    setMessage('');
    try {
      await addAdminCredit({ userId, amountIdr: amount, reason: 'manual_topup_shopee' }, accessToken);
      setAmountByUser((current) => ({ ...current, [userId]: '' }));
      await loadAdminData();
      setMessage('Credit berhasil ditambahkan.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function setUserPatch(userId, patch) {
    setIsBusy(true);
    setMessage('');
    try {
      await updateAdminUser({ userId, patch }, accessToken);
      await loadAdminData();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function approvePayment(paymentId) {
    setIsBusy(true);
    setMessage('');
    try {
      await approveManualPayment(paymentId, accessToken);
      await loadAdminData();
      setMessage('Pembayaran disetujui dan credit masuk.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function rejectPayment(paymentId) {
    setIsBusy(true);
    setMessage('');
    try {
      await rejectManualPayment(paymentId, { reason: rejectReasonByPayment[paymentId] || '' }, accessToken);
      await loadAdminData();
      setMessage('Pembayaran ditolak.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function savePricing(rule) {
    const draft = pricingDraft[rule.key] || {};
    setIsBusy(true);
    setMessage('');
    try {
      await updateAdminPricingRule(
        {
          key: rule.key,
          amountIdr: draft.amountIdr,
          description: draft.description,
          active: draft.active
        },
        accessToken
      );
      await loadAdminData();
      setMessage('Harga berhasil disimpan.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveShopeeSetting() {
    setIsBusy(true);
    setMessage('');
    try {
      await updateAdminSetting(
        {
          key: 'shopee_payment',
          value: shopeeDraft,
          isPublic: true,
          description: 'Konfigurasi pembayaran manual Shopee'
        },
        accessToken
      );
      await loadAdminData();
      setMessage('Setting Shopee berhasil disimpan.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Halaman superadmin</h2>
        </div>
        <button
          type="button"
          onClick={loadAdminData}
          disabled={isBusy}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-sm font-semibold ${activeTab === id ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink hover:border-spruce'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {message && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}

      {activeTab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map(([label, value]) => (
            <div key={label} className="border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase text-gray-600">{label}</p>
              <p className="mt-1 text-2xl font-black text-ink">{value}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-600">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Credit</th>
                <th className="py-2 pr-3">Top up</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-line">
                  <td className="py-2 pr-3 font-medium text-ink">{user.email}</td>
                  <td className="py-2 pr-3">
                    <select value={user.role} onChange={(event) => setUserPatch(user.id, { role: event.target.value })} className="border border-line bg-white px-2 py-1">
                      <option value="user">user</option>
                      <option value="superuser">superadmin</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">{user.is_unlimited ? 'Unlimited' : formatRupiah(user.balance || 0)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={amountByUser[user.id] || ''}
                        onChange={(event) => setAmountByUser((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="w-28 border border-line px-2 py-1"
                        placeholder="10000"
                      />
                      <button type="button" onClick={() => addCredit(user.id)} className="border border-spruce px-2 py-1 font-semibold text-spruce">
                        Tambah
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={user.is_active} onChange={(event) => setUserPatch(user.id, { is_active: event.target.checked })} />
                      Aktif
                    </label>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => setUserPatch(user.id, { is_active: false, deleted_at: new Date().toISOString() })}
                      className="inline-flex h-8 w-8 items-center justify-center border border-tomato text-tomato"
                      title="Nonaktifkan user"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-600">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Nominal</th>
                <th className="py-2 pr-3">Order Shopee</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Catatan</th>
                <th className="py-2 pr-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-line">
                  <td className="py-2 pr-3 font-medium text-ink">{payment.user_email}</td>
                  <td className="py-2 pr-3">{formatRupiah(payment.amount_idr)}</td>
                  <td className="py-2 pr-3">{payment.order_ref || '-'}</td>
                  <td className="py-2 pr-3"><StatusBadge status={payment.status} /></td>
                  <td className="py-2 pr-3">{payment.notes || payment.rejected_reason || '-'}</td>
                  <td className="py-2 pr-3">
                    {payment.status === 'pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => approvePayment(payment.id)} className="inline-flex h-8 w-8 items-center justify-center border border-spruce text-spruce" title="Approve">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <input
                          value={rejectReasonByPayment[payment.id] || ''}
                          onChange={(event) => setRejectReasonByPayment((current) => ({ ...current, [payment.id]: event.target.value }))}
                          className="w-36 border border-line px-2 py-1"
                          placeholder="Alasan tolak"
                        />
                        <button type="button" onClick={() => rejectPayment(payment.id)} className="inline-flex h-8 w-8 items-center justify-center border border-tomato text-tomato" title="Reject">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'pricing' && (
        <div className="grid gap-3">
          {pricingRules.map((rule) => {
            const draft = pricingDraft[rule.key] || {};
            return (
              <div key={rule.key} className="grid gap-3 border border-line bg-panel p-3 md:grid-cols-[1fr_160px_1.4fr_auto_auto] md:items-end">
                <div>
                  <p className="text-sm font-bold text-ink">{pricingLabels[rule.key] || rule.key}</p>
                  <p className="text-xs text-gray-600">Aturan harga aplikasi</p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-600">Harga</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={draft.amountIdr ?? rule.amount_idr}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, amountIdr: event.target.value } }))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-spruce"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-600">Deskripsi</span>
                  <input
                    value={draft.description ?? rule.description ?? ''}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, description: event.target.value } }))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-spruce"
                  />
                </label>
                <label className="inline-flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.active ?? rule.active}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, active: event.target.checked } }))}
                  />
                  Aktif
                </label>
                <button type="button" onClick={() => savePricing(rule)} className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Simpan
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid gap-3">
          <div className="border border-line bg-panel p-3">
            <h3 className="mb-3 text-sm font-bold text-ink">Pembayaran Shopee</h3>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Link Shopee</span>
                <input value={shopeeDraft.url} onChange={(event) => setShopeeDraft((current) => ({ ...current, url: event.target.value }))} className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Catatan pembayaran</span>
                <textarea value={shopeeDraft.note} onChange={(event) => setShopeeDraft((current) => ({ ...current, note: event.target.value }))} className="min-h-24 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Kontak admin</span>
                <input value={shopeeDraft.contact} onChange={(event) => setShopeeDraft((current) => ({ ...current, contact: event.target.value }))} className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <button type="button" onClick={saveShopeeSetting} className="inline-flex min-h-10 w-fit items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan setting
              </button>
            </div>
          </div>
          <div className="border border-line bg-white p-3 text-sm text-gray-700">
            Setting tersimpan dibaca oleh halaman billing user tanpa menyimpan file output di server.
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-600">
                <th className="py-2 pr-3">Waktu</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Produksi</th>
                <th className="py-2 pr-3">Input</th>
                <th className="py-2 pr-3">Film</th>
                <th className="py-2 pr-3">Nilai</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-line">
                  <td className="py-2 pr-3">{new Date(job.created_at).toLocaleString('id-ID')}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{job.user_email}</td>
                  <td className="py-2 pr-3">{job.production_type === 'sablon' ? 'Sablon' : 'Sticker'}</td>
                  <td className="py-2 pr-3">{inputModeLabels[job.input_mode] || job.input_mode}</td>
                  <td className="py-2 pr-3">{job.separation_film_count}</td>
                  <td className="py-2 pr-3">{formatRupiah(job.price_idr || 0)}</td>
                  <td className="py-2 pr-3"><StatusBadge status={job.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
