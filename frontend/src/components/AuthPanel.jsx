import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const GOOGLE_REDIRECT_TO = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_TO || window.location.origin;

export default function AuthPanel({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.');
      return;
    }
    setIsBusy(true);
    setMessage('');
    try {
      const result =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) onSignedIn?.(result.data.session);
      setMessage(mode === 'login' ? 'Login berhasil.' : 'Register berhasil. Cek email jika konfirmasi diwajibkan.');
    } catch (error) {
      setMessage(error.message || 'Auth gagal.');
    } finally {
      setIsBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) {
      setMessage('Supabase belum dikonfigurasi.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: GOOGLE_REDIRECT_TO }
    });
    if (error) setMessage(error.message);
  }

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <LogIn className="h-5 w-5 text-spruce" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">{mode === 'login' ? 'Login' : 'Register'}</h2>
      </div>

      <form className="grid gap-3" onSubmit={submit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            placeholder="nama@email.com"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            minLength={6}
            required
          />
        </label>
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex min-h-11 items-center justify-center border border-spruce bg-spruce px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {isBusy ? 'Memproses' : mode === 'login' ? 'Login email' : 'Buat akun'}
        </button>
      </form>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink hover:border-spruce"
      >
        Login dengan Google
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-3 text-sm font-semibold text-spruce"
      >
        {mode === 'login' ? 'Belum punya akun? Register' : 'Sudah punya akun? Login'}
      </button>

      {message && <p className="mt-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}
    </section>
  );
}
