'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldStar, ClockCounterClockwise, ArrowsSplit, UsersThree } from '@/components/ui/core-essential-icons';
import { api, setToken } from '@/lib/api';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  feat1: { id: 'Balasan AI dengan kontrol supervisor di setiap akun', en: 'AI replies with supervisor control on every account' },
  feat2: { id: 'Sentinel review: cegah pesan berisiko terkirim', en: 'Sentinel review: stop risky messages before they send' },
  feat3: { id: 'Setiap keputusan tercatat & bisa diaudit', en: 'Every decision logged and auditable' },
  feat4: { id: 'Ambil alih manual untuk percakapan sensitif', en: 'Manual takeover for sensitive conversations' },
  badge: { id: 'Operasi AI yang tersupervisi', en: 'Supervised AI operations' },
  headline: { id: 'Kelola banyak akun WhatsApp Sales & CS dari satu dashboard.', en: 'Manage every WhatsApp Sales & CS account from one dashboard.' },
  sub: { id: 'Prioritaskan lead, review balasan AI, jalankan campaign terkontrol, dan cegah pesan berisiko terkirim tanpa persetujuan admin.', en: 'Prioritise leads, review AI replies, run controlled campaigns, and stop risky messages from sending without admin approval.' },
  footer: { id: 'Workspace operasional untuk layanan pelanggan yang tersupervisi dan terlacak.', en: 'Operational workspace for supervised, traceable customer service.' },
  signinTitle: { id: 'Masuk', en: 'Sign in' },
  signinSub: { id: 'Akses Sentinel Control Center untuk tim Sales & CS.', en: 'Access the Sentinel Control Center for your Sales & CS team.' },
  pwPlaceholder: { id: 'Masukkan password Anda', en: 'Enter your password' },
  submit: { id: 'Masuk ke Dashboard', en: 'Go to dashboard' },
  submitting: { id: 'Memproses…', en: 'Signing in…' },
  errFallback: { id: 'Gagal masuk. Periksa email dan password Anda.', en: 'Sign-in failed. Check your email and password.' },
};

export default function LoginPage() {
  const t = useT(dict);
  const router = useRouter();

  const features = [
    { icon: ArrowsSplit, text: t('feat1') },
    { icon: ShieldStar, text: t('feat2') },
    { icon: ClockCounterClockwise, text: t('feat3') },
    { icon: UsersThree, text: t('feat4') },
  ];
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
      setError(err instanceof Error ? err.message : t('errFallback'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <section className="hidden w-[46%] flex-col justify-between border-r border-gray-800 bg-gray-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-sentinel-700 text-white">
            <ShieldStar className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Sentinel Control Center</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">AI Sales & Customer Service</p>
          </div>
        </div>

        <div className="max-w-md space-y-7">
          <div className="space-y-4">
            <p className="inline-flex rounded border border-sentinel-400/30 bg-sentinel-950 px-2.5 py-1 text-xs font-semibold text-sentinel-200">
              {t('badge')}
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
              {t('headline')}
            </h1>
            <p className="max-w-sm text-sm leading-6 text-gray-400">
              {t('sub')}
            </p>
          </div>
          <ul className="grid gap-2">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded border border-gray-800 bg-gray-900/70 px-3 py-2.5 text-[13px] text-gray-300">
                <Icon className="h-4 w-4 text-sentinel-300" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-gray-500">{t('footer')}</p>
      </section>

      <section className="flex flex-1 items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-sentinel-700 text-white lg:hidden">
              <ShieldStar className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-gray-50">{t('signinTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500">{t('signinSub')}</p>
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
                className="h-10 w-full rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 transition-colors focus:border-sentinel-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Password</label>
              <input
                id="login-password"
                type="password"
                placeholder={t('pwPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 transition-colors focus:border-sentinel-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
              className="flex h-10 w-full items-center justify-center gap-2 rounded border border-sentinel-800 bg-sentinel-700 text-sm font-semibold text-white transition-all hover:bg-sentinel-800 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              aria-label="Sign in"
            >
              <ShieldStar className="h-4 w-4" aria-hidden="true" />
              {loading ? t('submitting') : t('submit')}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
