import { ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAppConfig } from '../lib/api.js';

export default function BillingPanel({ session }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    getAppConfig()
      .then((data) => setConfig(data.settings || {}))
      .catch(() => setConfig({}));
  }, []);

  const shopee = config?.shopee_payment || {};
  const shopeeUrl = shopee.url || 'https://shopee.co.id/';
  const shopeeNote =
    shopee.note ||
    'Checkout nominal credit di Shopee, lalu kirim email akun Design Mudah melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.';

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
      <div className="mt-5 grid gap-3">
        <div className="border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-gray-600">Email akun Design Mudah</p>
          <p className="mt-1 break-all text-sm font-semibold text-ink">{session?.user?.email || '-'}</p>
        </div>
        <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
          <p>Setelah checkout di Shopee, kirim email akun di atas melalui chat Shopee.</p>
          <p>Admin akan top up credit manual ke akun tersebut dalam 5-15 menit pada jam kerja.</p>
        </div>
      </div>
    </section>
  );
}
