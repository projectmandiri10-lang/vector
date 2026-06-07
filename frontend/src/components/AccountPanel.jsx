import { CreditCard, LogOut, ShoppingBag } from 'lucide-react';
import { formatRupiah } from '../lib/pricing.js';

const SUPERUSER_ACCOUNT = ['jho.j80@gm', 'a', 'il.com'].join('');

export default function AccountPanel({ session, balance, balanceError, onRefreshBalance, onSignOut }) {
  const profile = balance?.profile;
  const sessionEmail = session?.user?.email?.toLowerCase() || '';
  const isFallbackSuperadmin = sessionEmail === SUPERUSER_ACCOUNT;
  const isSuperadmin = ['superuser', 'superadmin'].includes(profile?.role) || (!profile && isFallbackSuperadmin);
  const isUnlimited = profile?.is_unlimited ?? isFallbackSuperadmin;
  const balanceLabel = isUnlimited ? 'Unlimited' : formatRupiah(balance?.balance || 0);

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCard className="h-5 w-5 shrink-0 text-spruce" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{session?.user?.email}</h2>
            <p className="text-xs text-gray-600">{isSuperadmin ? 'Superadmin' : 'User'}</p>
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

      {balanceError && <p className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{balanceError}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-gray-600">Saldo credit</p>
          <p className="mt-1 text-2xl font-black text-ink">{balanceLabel}</p>
        </div>
        <div className="border border-line bg-panel p-3">
          <p className="text-xs font-semibold uppercase text-gray-600">Top up manual</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">Checkout di Shopee, lalu kirim email akun ini via chat Shopee. Admin top up manual 5-15 menit jam kerja.</p>
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
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Pembayaran Shopee
        </a>
      </div>
    </section>
  );
}
