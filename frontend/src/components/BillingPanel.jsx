import { ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createManualPayment, getAppConfig, toUserApiError } from '../lib/api.js';
import { formatRupiah } from '../lib/pricing.js';

export default function BillingPanel({ session }) {
  const [config, setConfig] = useState(null);
  const [amountIdr, setAmountIdr] = useState('10000');
  const [orderRef, setOrderRef] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    getAppConfig()
      .then((data) => setConfig(data.settings || {}))
      .catch(() => setConfig({}));
  }, []);

  async function submitPayment(event) {
    event.preventDefault();
    if (!session?.access_token) {
      setMessage('Login dibutuhkan untuk mengirim konfirmasi pembayaran.');
      return;
    }
    setIsBusy(true);
    setMessage('');
    try {
      const payment = await createManualPayment({ amountIdr, orderRef, notes }, session.access_token);
      setOrderRef('');
      setNotes('');
      setMessage(`Konfirmasi pembayaran ${formatRupiah(payment.payment?.amount_idr || amountIdr)} sudah dikirim dan menunggu pengecekan admin.`);
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal mengirim konfirmasi pembayaran.').message);
    } finally {
      setIsBusy(false);
    }
  }

  const shopee = config?.shopee_payment || {};
  const shopeeUrl = shopee.url || 'https://shopee.co.id/';
  const shopeeNote = shopee.note || 'Pilih nominal credit di listing Shopee, bayar, lalu masukkan nomor pesanan di form ini.';

  return (
    <section id="billing" className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Pembayaran manual Shopee</h2>
      </div>
      <div className="grid gap-3 text-sm leading-6 text-gray-700">
        <p>{shopeeNote}</p>
        <a
          href={shopeeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-fit items-center justify-center border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white hover:bg-teal-700"
        >
          Buka Shopee Marketplace
        </a>
        {shopee.contact && <p>Kontak admin: {shopee.contact}</p>}
      </div>

      <form className="mt-5 grid gap-3" onSubmit={submitPayment}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Nominal pembayaran</span>
          <input
            type="number"
            min="1000"
            step="1000"
            value={amountIdr}
            onChange={(event) => setAmountIdr(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Nomor pesanan Shopee</span>
          <input
            value={orderRef}
            onChange={(event) => setOrderRef(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            placeholder="Contoh: 250526ABC123"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Catatan</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-24 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            placeholder="Email Shopee, nama pembeli, atau detail lain"
          />
        </label>
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex min-h-11 items-center justify-center border border-spruce bg-spruce px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {isBusy ? 'Mengirim' : 'Kirim konfirmasi pembayaran'}
        </button>
      </form>
      {message && <p className="mt-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}
    </section>
  );
}
