'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Cpu, CircleX } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AiSettingsPage() {
  const [config, setConfig] = useState<{ baseUrl: string; defaultModel: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ baseUrl: string; defaultModel: string }>('/ai/config')
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat konfigurasi AI — periksa koneksi ke API.'));
  }, []);

  async function loadModels() {
    setLoading(true);
    setError(null);
    try {
      setModels(await api<string[]>('/ai/models'));
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar model dari provider.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="AI Settings" subtitle="Konfigurasi provider dan model yang tersedia" />

      <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5">
        <Card className="mb-5 p-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Base URL</dt>
              <dd className="truncate font-mono text-gray-800 dark:text-gray-200">{config?.baseUrl ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Model default</dt>
              <dd className="truncate font-mono text-gray-800 dark:text-gray-200">{config?.defaultModel ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            Provider bersifat OpenAI-compatible — ubah lewat env AI_BASE_URL / AI_API_KEY /
            AI_MODEL (OpenAI, OpenRouter, Ollama, LM Studio, vLLM).
          </p>
        </Card>

        <Button onClick={loadModels} disabled={loading} className="mb-4">
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {loading ? 'Memuat…' : 'Load models from Base URL'}
        </Button>

        {error && (
          <Card className="mb-4 flex items-start gap-2 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
              <button onClick={loadModels} className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">
                Coba lagi
              </button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => <div key={n} className="h-8 rounded animate-shimmer" />)}
          </div>
        ) : models.length > 0 ? (
          <Card className="p-4">
            <ul className="space-y-1 text-sm">
              {models.map((m) => (
                <li key={m} className="font-mono text-gray-700 dark:text-gray-200">{m}</li>
              ))}
            </ul>
          </Card>
        ) : loaded && !error ? (
          <Card className="flex flex-col items-center justify-center py-12 text-center">
            <Cpu className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak ada model ditemukan</p>
            <p className="mt-1 text-[13px] text-gray-400">
              Periksa Base URL dan API key provider, lalu muat ulang daftar model.
            </p>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
}
