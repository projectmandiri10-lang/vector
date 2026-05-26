import { CreditCard, LogOut, ShoppingBag } from 'lucide-react';
import { formatRupiah } from '../lib/pricing.js';

export default function AccountPanel({ session, balance, onRefreshBalance, onSignOut }) {
  const profile = balance?.profile;
  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCard className="h-5 w-5 shrink-0 text-spruce" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{session?.user?.email}</h2>
            <p className="text-xs text-gray-600">{profile?.role === 'superuser' ? 'Superuser' : 'User'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex h-9 w-9 items-center justify-center border border-line bg-white text-gray-700 hover:border-tomato hover:text-tomato"
          title="Logout"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-gray-600">Saldo credit</p>
          <p className="mt-1 text-2xl font-black text-ink">{profile?.is_unlimited ? 'Unlimited' : formatRupiah(balance?.balance || 0)}</p>
        </div>
        <div className="border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-gray-600">Top up manual</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">Bayar via Shopee Marketplace, lalu admin approve dan credit masuk.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefreshBalance}
          className="inline-flex min-h-10 items-center justify-center border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce"
        >
          Refresh saldo
        </button>
        <a
          href="#billing"
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Pembayaran Shopee
        </a>
      </div>
    </section>
  );
}
