'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="AI Settings" subtitle="Provider configuration and available models" />

      <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5">
        <Card className="mb-5 p-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Base URL</dt>
              <dd className="truncate font-mono text-gray-800 dark:text-gray-200">{config?.baseUrl ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">Default model</dt>
              <dd className="truncate font-mono text-gray-800 dark:text-gray-200">{config?.defaultModel ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            The provider is OpenAI-compatible — change it via the AI_BASE_URL / AI_API_KEY /
            AI_MODEL env vars (OpenAI, OpenRouter, Ollama, LM Studio, vLLM).
          </p>
        </Card>

        <Button onClick={loadModels} disabled={loading} className="mb-4">
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {loading ? 'Loading…' : 'Load models from Base URL'}
        </Button>

        {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

        {models.length > 0 && (
          <Card className="p-4">
            <ul className="space-y-1 text-sm">
              {models.map((m) => (
                <li key={m} className="font-mono text-gray-700 dark:text-gray-200">{m}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
