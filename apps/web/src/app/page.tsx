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
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 dark:bg-wa-bg">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-wa-accent text-xl text-white shadow-card">
            &#9889;
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Hermes Control Center
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">Masuk untuk mengelola percakapan</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-wa-panel"
        >
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="owner@hermes.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-wa-accent dark:border-gray-700 dark:bg-black/30 dark:text-gray-100"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-xs font-medium text-gray-600 dark:text-gray-400">Password</label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-wa-accent dark:border-gray-700 dark:bg-black/30 dark:text-gray-100"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-pastel-red px-3 py-2 text-sm text-pastel-redInk">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-wa-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wa-accent/90 disabled:opacity-50"
          >
            {loading ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
