'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

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
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wa-app-shell flex min-h-[100dvh] items-center justify-center p-4 text-gray-100 sm:p-6">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111b21]/90 shadow-2xl shadow-black/40 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="wa-chat-surface hidden min-h-[520px] flex-col justify-between p-10 lg:flex">
          <div className="max-w-xl">
            <div className="mb-7 inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-emerald-200">
              Live WhatsApp cockpit
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white">
              Satu ruang kerja untuk CS dan sales WhatsApp.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-gray-300">
              Pantau percakapan, takeover AI, jalankan campaign aman, dan baca performa operator dari satu cockpit.
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="max-w-sm rounded-3xl rounded-bl-md bg-[var(--wa-chat-in)] p-4 text-gray-100 shadow-xl shadow-black/20">
              Ada prospek hot yang butuh follow-up sebelum sore ini.
            </div>
            <div className="ml-auto max-w-sm rounded-3xl rounded-br-md bg-[var(--wa-chat-out)] p-4 text-gray-50 shadow-xl shadow-black/20">
              Saya takeover, cek konteks, lalu kirim balasan manual.
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-8 sm:p-10">
          <div>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-300 to-[#00a884] text-xl font-black text-[#06251e] shadow-lg shadow-emerald-950/50">
              H
            </div>
            <p className="text-xs font-semibold tracking-[0.08em] text-emerald-300/75">Secure login</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Masuk ke Hermes</h2>
            <p className="mt-2 text-sm text-gray-400">Gunakan akun operator, admin, supervisor, atau owner.</p>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold tracking-[0.08em] text-gray-400">Email</span>
            <input
              type="email"
              placeholder="nama@bisnis.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="wa-focus w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none placeholder:text-gray-500"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold tracking-[0.08em] text-gray-400">Password</span>
            <input
              type="password"
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="wa-focus w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none placeholder:text-gray-500"
              required
            />
          </label>

          {error && (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="wa-action w-full rounded-2xl bg-emerald-400 py-3 font-bold text-[#06251e] shadow-lg shadow-emerald-950/40 hover:bg-emerald-300 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </section>
    </main>
  );
}
