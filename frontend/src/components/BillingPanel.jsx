import { ShoppingBag } from 'lucide-react';

export default function BillingPanel() {
  return (
    <section id="billing" className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Pembayaran manual Shopee</h2>
      </div>
      <div className="grid gap-3 text-sm leading-6 text-gray-700">
        <p>Pilih nominal credit di listing Shopee, bayar, lalu kirim nomor pesanan ke admin. Setelah dicek, credit ditambahkan manual dari halaman admin.</p>
        <a
          href="https://shopee.co.id/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-fit items-center justify-center border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white hover:bg-teal-700"
        >
          Buka Shopee Marketplace
        </a>
      </div>
    </section>
  );
}
