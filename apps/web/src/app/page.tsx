'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, History, Workflow, UsersRound } from 'lucide-react';
import { api, setToken } from '@/lib/api';

const features = [
  { icon: Workflow, text: 'Balasan AI dengan kontrol supervisor di setiap akun' },
  { icon: ShieldCheck, text: 'Hermes review: cegah pesan berisiko terkirim' },
  { icon: History, text: 'Setiap keputusan tercatat & bisa diaudit' },
  { icon: UsersRound, text: 'Ambil alih manual untuk percakapan sensitif' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      router.push('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk. Periksa email dan password Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <section className="hidden w-[46%] flex-col justify-between border-r border-gray-800 bg-gray-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-hermes-700 text-white">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Hermes Control Center</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">AI Sales & Customer Service</p>
          </div>
        </div>

        <div className="max-w-md space-y-7">
          <div className="space-y-4">
            <p className="inline-flex rounded border border-hermes-400/30 bg-hermes-950 px-2.5 py-1 text-xs font-semibold text-hermes-200">
              Operasi AI yang tersupervisi
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
              Kelola banyak akun WhatsApp Sales &amp; CS dari satu dashboard.
            </h1>
            <p className="max-w-sm text-sm leading-6 text-gray-400">
              Prioritaskan lead, review balasan AI, jalankan campaign terkontrol, dan cegah pesan berisiko terkirim tanpa persetujuan admin.
            </p>
          </div>
          <ul className="grid gap-2">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded border border-gray-800 bg-gray-900/70 px-3 py-2.5 text-[13px] text-gray-300">
                <Icon className="h-4 w-4 text-hermes-300" strokeWidth={1.75} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-gray-500">Workspace operasional untuk layanan pelanggan yang tersupervisi dan terlacak.</p>
      </section>

      <section className="flex flex-1 items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-hermes-700 text-white lg:hidden">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-gray-50">Masuk</h2>
              <p className="mt-1 text-sm text-gray-500">Akses Hermes Control Center untuk tim Sales &amp; CS.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Email</label>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-hermes-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Password</label>
              <input
                id="login-password"
                type="password"
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-hermes-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                required
              />
            </div>
            {error && (
              <div className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-900 dark:bg-danger-900/20 dark:text-danger-400">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded border border-hermes-800 bg-hermes-700 text-sm font-semibold text-white transition-colors hover:bg-hermes-800 disabled:opacity-60"
              aria-label="Sign in"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {loading ? 'Memproses…' : 'Masuk ke Dashboard'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
