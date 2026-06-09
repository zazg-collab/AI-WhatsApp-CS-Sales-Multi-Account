'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

export default function AiSettingsPage() {
  const [config, setConfig] = useState<{
    baseUrl: string;
    defaultModel: string;
  } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ baseUrl: string; defaultModel: string }>('/ai/config')
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  async function loadModels() {
    setLoading(true);
    setError(null);
    try {
      setModels(await api<string[]>('/ai/models'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat model');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout><main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-xl font-semibold text-wa-accent">
        Pengaturan AI
      </h1>

      <div className="mb-6 rounded-lg bg-wa-panel p-4 text-sm">
        <p>
          <span className="text-gray-400">Base URL:</span>{' '}
          {config?.baseUrl ?? '—'}
        </p>
        <p>
          <span className="text-gray-400">Default model:</span>{' '}
          {config?.defaultModel ?? '—'}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Provider bersifat OpenAI-compatible — ganti lewat env AI_BASE_URL /
          AI_API_KEY / AI_MODEL (OpenAI, OpenRouter, Ollama, LM Studio, vLLM).
        </p>
      </div>

      <button
        onClick={loadModels}
        disabled={loading}
        className="mb-4 rounded bg-wa-accent px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {loading ? 'Memuat...' : 'Muat model dari Base URL'}
      </button>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {models.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-wa-panel p-4 text-sm">
          {models.map((m) => (
            <li key={m} className="font-mono text-gray-200">
              {m}
            </li>
          ))}
        </ul>
      )}
    </main></AppLayout>
  );
}
