'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Cpu, FloppyDisk, ShieldWarning, ChatCircle, Bell, Clock, MegaphoneSimple, type Icon } from '@phosphor-icons/react';
import { api, hasRole } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Pengaturan', en: 'Settings' },
  subtitle: { id: 'Konfigurasi AI, WhatsApp anti-ban, notifikasi, dan SLA', en: 'Configure AI, WhatsApp anti-ban, notifications, and SLA' },
  tabAi: { id: 'AI Provider', en: 'AI Provider' },
  tabWa: { id: 'WhatsApp & Anti-ban', en: 'WhatsApp & Anti-ban' },
  tabNotif: { id: 'Notifikasi & SLA', en: 'Notifications & SLA' },
  readOnly: { id: 'Hanya owner yang dapat mengubah pengaturan. Anda melihat dalam mode baca.', en: 'Only owners can change settings. You are viewing in read-only mode.' },
  loadError: { id: 'Gagal memuat pengaturan dari API.', en: 'Failed to load settings from the API.' },
  saveError: { id: 'Gagal menyimpan pengaturan.', en: 'Failed to save settings.' },
  delayRangeError: { id: 'Jeda minimum tidak boleh lebih besar dari maksimum.', en: 'Minimum delay cannot be greater than the maximum.' },
  saved: { id: 'Tersimpan.', en: 'Saved.' },
  save: { id: 'Simpan perubahan', en: 'Save changes' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  // AI
  baseUrl: { id: 'Base URL', en: 'Base URL' },
  baseUrlHint: { id: 'Endpoint OpenAI-compatible, mis. https://api.openai.com/v1', en: 'OpenAI-compatible endpoint, e.g. https://api.openai.com/v1' },
  apiKey: { id: 'API Key', en: 'API Key' },
  apiKeySet: { id: 'Tersimpan — kosongkan untuk tidak mengubah', en: 'Stored — leave blank to keep unchanged' },
  apiKeyEmpty: { id: 'Belum diatur', en: 'Not set' },
  model: { id: 'Model default', en: 'Default model' },
  loadModels: { id: 'Muat daftar model', en: 'Load model list' },
  temperature: { id: 'Temperature (0–2)', en: 'Temperature (0–2)' },
  timeout: { id: 'Timeout (ms)', en: 'Timeout (ms)' },
  noModels: { id: 'Tidak ada model ditemukan. Periksa Base URL & API key.', en: 'No models found. Check Base URL & API key.' },
  // WA
  waIntro: { id: 'Jeda mirip-manusia menurunkan risiko banned. Nilai dalam milidetik.', en: 'Human-like delays reduce ban risk. Values in milliseconds.' },
  humanMin: { id: 'Jeda kirim minimum (ms)', en: 'Min send delay (ms)' },
  humanMax: { id: 'Jeda kirim maksimum (ms)', en: 'Max send delay (ms)' },
  typingPerChar: { id: 'Durasi mengetik per karakter (ms)', en: 'Typing duration per char (ms)' },
  typingMin: { id: 'Durasi mengetik minimum (ms)', en: 'Min typing duration (ms)' },
  typingMax: { id: 'Durasi mengetik maksimum (ms)', en: 'Max typing duration (ms)' },
  // Notif & SLA
  notifyTarget: { id: 'Target notifikasi Hermes', en: 'Hermes notification target' },
  notifyHint: { id: 'mis. "telegram", "slack:#alerts", "whatsapp". Kosongkan untuk menonaktifkan.', en: 'e.g. "telegram", "slack:#alerts", "whatsapp". Empty disables it.' },
  slaMinutes: { id: 'Ambang SLA balasan (menit)', en: 'SLA response threshold (minutes)' },
  slaHint: { id: 'Chat pelanggan yang belum dibalas melebihi ini ditandai melanggar SLA.', en: 'Customer chats unanswered beyond this are flagged as SLA breaches.' },
  // Hermes
  tabHermes: { id: 'Hermes Supervisor', en: 'Hermes Supervisor' },
  hermesComingSoon: {
    id: 'Ambang keyakinan, keyword berisiko, dan mode review saat ini ditentukan di kode (rules.engine.ts), bukan lewat pengaturan. Konfigurasi UI akan ditambahkan di iterasi berikutnya.',
    en: 'Confidence thresholds, risk keywords, and review mode are currently fixed in code (rules.engine.ts), not configurable here. UI configuration is planned for a future iteration.',
  },
  // Campaign
  tabCampaign: { id: 'Keamanan Campaign', en: 'Campaign Safety' },
  campaignComingSoon: {
    id: 'Approval, rate limit, dan opt-out campaign sudah diatur per-campaign di halaman Campaigns. Pengaturan global belum tersedia di sini.',
    en: 'Campaign approval, rate limiting, and opt-out are already configured per-campaign on the Campaigns page. Global settings here are not available yet.',
  },
};

type Tab = 'ai' | 'wa' | 'notif' | 'hermes' | 'campaign';

interface SettingsShape {
  ai: { baseUrl: string; model: string; temperature: number; timeoutMs: number; apiKeySet: boolean };
  wa: { humanDelayMinMs: number; humanDelayMaxMs: number; typingPerCharMs: number; typingMinMs: number; typingMaxMs: number };
  notifications: { hermesNotifyTarget: string };
  sla: { responseMinutes: number };
}

const fieldCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

export default function SettingsPage() {
  const t = useT(dict);
  const canEdit = hasRole('owner');
  const [tab, setTab] = useState<Tab>('ai');
  const [data, setData] = useState<SettingsShape | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsMsg, setModelsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsShape>('/settings')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('loadError')));
  }, [t]);

  function patch<K extends keyof SettingsShape>(cat: K, key: keyof SettingsShape[K], value: unknown) {
    setData((prev) => (prev ? { ...prev, [cat]: { ...prev[cat], [key]: value } } : prev));
    setSavedMsg(null);
  }

  async function loadModels() {
    setLoadingModels(true);
    setModelsMsg(null);
    try {
      const list = await api<string[]>('/ai/models');
      setModels(list);
      if (list.length === 0) setModelsMsg(t('noModels'));
    } catch {
      setModelsMsg(t('noModels'));
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    if (!data || !canEdit) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      if (tab === 'ai') {
        payload.ai = {
          baseUrl: data.ai.baseUrl,
          model: data.ai.model,
          temperature: Number(data.ai.temperature),
          timeoutMs: Number(data.ai.timeoutMs),
          ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
        };
      } else if (tab === 'wa') {
        if (
          Number(data.wa.humanDelayMinMs) > Number(data.wa.humanDelayMaxMs) ||
          Number(data.wa.typingMinMs) > Number(data.wa.typingMaxMs)
        ) {
          setError(t('delayRangeError'));
          return;
        }
        payload.wa = {
          humanDelayMinMs: Number(data.wa.humanDelayMinMs),
          humanDelayMaxMs: Number(data.wa.humanDelayMaxMs),
          typingPerCharMs: Number(data.wa.typingPerCharMs),
          typingMinMs: Number(data.wa.typingMinMs),
          typingMaxMs: Number(data.wa.typingMaxMs),
        };
      } else {
        payload.notifications = { hermesNotifyTarget: data.notifications.hermesNotifyTarget };
        payload.sla = { responseMinutes: Number(data.sla.responseMinutes) };
      }
      const updated = await api<SettingsShape>('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setData(updated);
      setApiKeyInput('');
      setSavedMsg(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: Icon }[] = [
    { key: 'ai', label: t('tabAi'), icon: Cpu },
    { key: 'wa', label: t('tabWa'), icon: ChatCircle },
    { key: 'notif', label: t('tabNotif'), icon: Bell },
    { key: 'hermes', label: t('tabHermes'), icon: ShieldWarning },
    { key: 'campaign', label: t('tabCampaign'), icon: Bell },
  ];

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-5">
        {/* Tabs */}
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.key}
                onClick={() => { setTab(tb.key); setSavedMsg(null); setError(null); }}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                  tab === tb.key
                    ? 'border-hermes-600 text-hermes-700 dark:text-hermes-300'
                    : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tb.label}
              </button>
            );
          })}
        </div>

        {!canEdit && (
          <Card className="mb-4 flex items-start gap-2 border-review-200 bg-review-50 p-3 dark:border-review-700/40 dark:bg-review-900/20">
            <ShieldWarning className="mt-0.5 h-4 w-4 shrink-0 text-review-600" aria-hidden="true" />
            <p className="text-[13px] text-review-700 dark:text-review-300">{t('readOnly')}</p>
          </Card>
        )}

        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
          </Card>
        )}

        {!data ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-10 rounded animate-shimmer" />)}
          </div>
        ) : (
          <Card className="p-4 sm:p-5">
            {tab === 'ai' && (
              <div className="space-y-4">
                <Field label={t('baseUrl')} hint={t('baseUrlHint')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.ai.baseUrl}
                    onChange={(e) => patch('ai', 'baseUrl', e.target.value)} />
                </Field>
                <Field label={t('apiKey')} hint={data.ai.apiKeySet ? t('apiKeySet') : t('apiKeyEmpty')}>
                  <input type="password" className={fieldCls} disabled={!canEdit}
                    placeholder={data.ai.apiKeySet ? '••••••••' : ''}
                    value={apiKeyInput} onChange={(e) => { setApiKeyInput(e.target.value); setSavedMsg(null); }} />
                </Field>
                <Field label={t('model')}>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input className={fieldCls} disabled={!canEdit} list="ai-models" value={data.ai.model}
                      onChange={(e) => patch('ai', 'model', e.target.value)} />
                    <datalist id="ai-models">
                      {models.map((m) => <option key={m} value={m} />)}
                    </datalist>
                    <Button variant="outline" size="sm" onClick={loadModels} disabled={loadingModels} className="shrink-0">
                      <ArrowsClockwise className={cn('h-4 w-4', loadingModels && 'animate-spin')} aria-hidden="true" />
                      {t('loadModels')}
                    </Button>
                  </div>
                  {modelsMsg && <p className="mt-1 text-xs text-gray-400">{modelsMsg}</p>}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('temperature')}>
                    <input type="number" step="0.1" min="0" max="2" className={fieldCls} disabled={!canEdit}
                      value={data.ai.temperature} onChange={(e) => patch('ai', 'temperature', e.target.value)} />
                  </Field>
                  <Field label={t('timeout')}>
                    <input type="number" min="1000" max="120000" className={fieldCls} disabled={!canEdit}
                      value={data.ai.timeoutMs} onChange={(e) => patch('ai', 'timeoutMs', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {tab === 'wa' && (
              <div className="space-y-4">
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('waIntro')}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('humanMin')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.wa.humanDelayMinMs} onChange={(e) => patch('wa', 'humanDelayMinMs', e.target.value)} />
                  </Field>
                  <Field label={t('humanMax')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.wa.humanDelayMaxMs} onChange={(e) => patch('wa', 'humanDelayMaxMs', e.target.value)} />
                  </Field>
                  <Field label={t('typingPerChar')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.wa.typingPerCharMs} onChange={(e) => patch('wa', 'typingPerCharMs', e.target.value)} />
                  </Field>
                  <Field label={t('typingMin')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.wa.typingMinMs} onChange={(e) => patch('wa', 'typingMinMs', e.target.value)} />
                  </Field>
                  <Field label={t('typingMax')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.wa.typingMaxMs} onChange={(e) => patch('wa', 'typingMaxMs', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {tab === 'notif' && (
              <div className="space-y-4">
                <Field label={t('notifyTarget')} hint={t('notifyHint')}>
                  <input className={fieldCls} disabled={!canEdit} placeholder="telegram"
                    value={data.notifications.hermesNotifyTarget}
                    onChange={(e) => patch('notifications', 'hermesNotifyTarget', e.target.value)} />
                </Field>
                <Field label={t('slaMinutes')} hint={t('slaHint')}>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input type="number" min="1" max="1440" className={cn(fieldCls, 'pl-9')} disabled={!canEdit}
                      value={data.sla.responseMinutes} onChange={(e) => patch('sla', 'responseMinutes', e.target.value)} />
                  </div>
                </Field>
              </div>
            )}

            {tab === 'hermes' && (
              <div className="space-y-4 py-4 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-review-50 dark:bg-review-900/20 mx-auto">
                  <ShieldWarning className="h-6 w-6 text-review-600" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('tabHermes')}</p>
                <p className="mx-auto max-w-md text-xs text-gray-500 dark:text-gray-400">{t('hermesComingSoon')}</p>
              </div>
            )}

            {tab === 'campaign' && (
              <div className="space-y-4 py-4 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-hermes-50 dark:bg-hermes-900/20 mx-auto">
                  <MegaphoneSimple className="h-6 w-6 text-hermes-600" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('tabCampaign')}</p>
                <p className="mx-auto max-w-md text-xs text-gray-500 dark:text-gray-400">{t('campaignComingSoon')}</p>
              </div>
            )}

            {canEdit && (
              <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button onClick={save} disabled={saving}>
                  <FloppyDisk className="h-4 w-4" aria-hidden="true" />
                  {saving ? t('saving') : t('save')}
                </Button>
                {savedMsg && <span className="text-[13px] font-medium text-hermes-600">{savedMsg}</span>}
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
