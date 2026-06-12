'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Zap, Bot, BarChart3 } from 'lucide-react';
import { api, setToken } from '@/lib/api';

const features = [
  { icon: Bot, text: 'AI-powered multi-account WhatsApp management' },
  { icon: ShieldCheck, text: 'Hermes supervisor reviews every message' },
  { icon: BarChart3, text: 'Real-time analytics and lead scoring' },
  { icon: Zap, text: 'Automated follow-ups and campaign delivery' },
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
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] overflow-hidden bg-gray-950">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between p-10 relative overflow-hidden bg-gradient-to-br from-gray-950 via-hermes-950/20 to-gray-950">
        {/* Decorative gradient orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-hermes-600/20 blur-[80px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-hermes-800/15 blur-[100px]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[60px]" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-hermes-400 to-hermes-700 shadow-[0_4px_16px_rgba(99,102,241,0.5)]">
            <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13px] font-bold text-white tracking-tight">Hermes</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Control Center</p>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
              Manage every conversation,<br />
              <span className="text-gradient">intelligently.</span>
            </h1>
            <p className="mt-4 text-[15px] text-gray-400 leading-relaxed max-w-sm">
              Multi-account WhatsApp CS platform with AI supervision, real-time monitoring, and automated sales flows.
            </p>
          </div>
          <ul className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[13px] text-gray-400">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-hermes-600/20 ring-1 ring-hermes-500/30">
                  <Icon className="h-3.5 w-3.5 text-hermes-400" strokeWidth={2} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-[11px] text-gray-700">
          Powered by Hermes AI &mdash; Nous Research models
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 dark:bg-gray-900 lg:rounded-l-3xl">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-hermes-400 to-hermes-700 shadow-[0_4px_16px_rgba(99,102,241,0.4)]">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <h1 className="text-[17px] font-bold tracking-tight text-gray-900 dark:text-gray-100">Hermes Control Center</h1>
          </div>

          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account to continue</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-hermes-400 focus:bg-white focus:ring-2 focus:ring-hermes-400/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-750"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-hermes-400 focus:bg-white focus:ring-2 focus:ring-hermes-400/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-b from-hermes-500 to-hermes-700 py-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(79,70,229,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all hover:from-hermes-400 hover:to-hermes-600 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
