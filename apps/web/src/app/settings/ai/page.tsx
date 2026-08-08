'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link'; // >>> ANGGA <<<
import { ArrowsClockwise, Cpu, FloppyDisk, ShieldWarning, ChatCircle, Bell, Clock, MegaphoneSimple, Package, type Icon } from '@/components/ui/core-essential-icons';
import { api } from '@/lib/api';
import { useHasRole } from '@/lib/use-has-role'; // >>> ANGGA <<<
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
  sentinelModel: { id: 'Model supervisor Sentinel', en: 'Sentinel supervisor model' },
  sentinelModelHint: {
    id: 'Dipakai Sentinel untuk review/ask/insight. Kosongkan untuk pakai model default. Disarankan model yang lebih kuat dari bot CS.',
    en: 'Used by Sentinel for review/ask/insight. Leave empty to reuse the default model. A stronger model than the CS bot is recommended.',
  },
  loadModels: { id: 'Muat daftar model', en: 'Load model list' },
  temperature: { id: 'Temperature (0–2)', en: 'Temperature (0–2)' },
  timeout: { id: 'Timeout (ms)', en: 'Timeout (ms)' },
  noModels: { id: 'Tidak ada model ditemukan. Periksa Base URL & API key.', en: 'No models found. Check Base URL & API key.' },
  testConnection: { id: 'Uji koneksi', en: 'Test connection' },
  testingConnection: { id: 'Menguji…', en: 'Testing…' },
  testOk: { id: 'Koneksi berhasil — {n} model tersedia.', en: 'Connection successful — {n} models available.' },
  testFail: { id: 'Koneksi gagal. Periksa Base URL & API key.', en: 'Connection failed. Check the Base URL & API key.' },
  // >>> ANGGA: sakelar RAG
  ragTitle: { id: 'Pencarian semantik (RAG)', en: 'Semantic retrieval (RAG)' },
  ragToggle: { id: 'Aktifkan RAG', en: 'Enable RAG' },
  ragHint: {
    id: 'Saat mati, knowledge dicari dengan pencocokan kata saja. Saat aktif, tiap item di-embed dan dicari berdasarkan makna. Butuh ekstensi pgvector (sudah terpasang lewat migrasi 20).',
    en: 'When off, knowledge is retrieved by keyword matching only. When on, each item is embedded and retrieved by meaning. Requires the pgvector extension (installed by migration 20).',
  },
  ragModel: { id: 'Model embedding', en: 'Embedding model' },
  ragModelHint: {
    id: 'Tidak muncul di daftar model chat — ketik manual. OpenAI: text-embedding-3-small · OpenRouter: openai/text-embedding-3-small',
    en: 'Not listed among chat models — type it manually. OpenAI: text-embedding-3-small · OpenRouter: openai/text-embedding-3-small',
  },
  ragDim: { id: 'Dimensi vektor', en: 'Vector dimension' },
  ragDimHint: {
    id: 'WAJIB sama dengan kolom vector(N) di database (bawaan 1536). Kalau beda, penyimpanan embedding gagal diam-diam.',
    en: 'MUST match the vector(N) column in the database (default 1536). A mismatch makes embedding writes fail silently.',
  },
  ragReindex: { id: 'Bangun ulang indeks', en: 'Rebuild index' },
  ragReindexing: { id: 'Membangun…', en: 'Rebuilding…' },
  ragReindexHint: {
    id: 'Jalankan sekali sesudah menyalakan RAG — item lama belum punya embedding. Memanggil API embedding, jadi ada biayanya.',
    en: 'Run once after enabling RAG — existing items have no embeddings yet. This calls the embedding API, so it costs money.',
  },
  ragReindexOk: { id: '{n} item terindeks dari {b} knowledge base.', en: 'Indexed {n} items across {b} knowledge bases.' },
  ragReindexOff: { id: 'RAG belum aktif di server — nyalakan lalu Simpan dulu.', en: 'RAG is not enabled on the server — turn it on and save first.' },
  ragReindexFail: { id: 'Gagal membangun indeks. Cek model embedding & API key.', en: 'Reindex failed. Check the embedding model & API key.' },
  ragDirty: { id: 'Ada perubahan RAG yang belum disimpan.', en: 'Unsaved RAG changes.' },
  ragMode: { id: 'Mode RAG', en: 'RAG Mode' },
  ragModeHint: {
    id: 'Hybrid: disuntikkan ke prompt utama. Agentic: AI memanggil pencarian sebagai alat saat butuh.',
    en: 'Hybrid: injected into main prompt. Agentic: AI calls search as a tool when needed.',
  },
  modeHybrid: { id: 'Hybrid (Native)', en: 'Hybrid (Native)' },
  modeAgentic: { id: 'Agentic (Tool)', en: 'Agentic (Tool)' },
  // <<< ANGGA
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
  // Sentinel
  tabSentinel: { id: 'Sentinel Supervisor', en: 'Sentinel Supervisor' },
  sentinelIntro: {
    id: 'Ambang keyakinan dan keyword berisiko di bawah ini melengkapi rules.engine.ts (legal/refund/komplain tetap hardcode sebagai pengaman dasar).',
    en: 'The thresholds and risk keywords below layer on top of rules.engine.ts (the legal/refund/complaint rules stay hardcoded as a baseline safety net).',
  },
  autoSendMin: { id: 'Ambang auto-send (confidence ≥)', en: 'Auto-send threshold (confidence ≥)' },
  autoSendMinHint: { id: 'Di atas ambang ini, balasan AI terkirim otomatis tanpa review admin.', en: 'Above this threshold, AI replies auto-send without admin review.' },
  draftMin: { id: 'Ambang draft (confidence ≥)', en: 'Draft threshold (confidence ≥)' },
  draftMinHint: { id: 'Di bawah ambang ini, balasan diblokir dan butuh admin. Di antara draft dan auto-send, balasan ditahan sebagai draft.', en: 'Below this threshold, replies are blocked and need an admin. Between draft and auto-send, replies are held as a draft.' },
  riskKeywords: { id: 'Keyword berisiko tambahan', en: 'Additional risk keywords' },
  riskKeywordsHint: { id: 'Dipisah koma. Cocok (case-insensitive) memaksa takeover_required. Mis. "DP, transfer manual"', en: 'Comma-separated. A case-insensitive match forces takeover_required. e.g. "DP, manual transfer"' },
  defaultAiMode: { id: 'Mode AI default akun baru', en: 'Default AI mode for new accounts' },
  defaultAiModeHint: { id: 'Dipakai saat menambah akun WhatsApp baru, kecuali diubah manual per-akun.', en: 'Used when adding a new WhatsApp account, unless changed manually per account.' },
  modeOff: { id: 'AI mati (manual)', en: 'AI off (manual)' },
  modeDraft: { id: 'AI draft (admin kirim)', en: 'AI draft (admin sends)' },
  modeSupervised: { id: 'AI supervised (Sentinel review)', en: 'AI supervised (Sentinel reviews)' },
  modeOn: { id: 'AI aktif (auto-reply)', en: 'AI on (auto-reply)' },
  // Campaign
  tabCampaign: { id: 'Keamanan Campaign', en: 'Campaign Safety' },
  tabShipping: { id: 'Ongkir (Mengantar)', en: 'Shipping (Mengantar)' }, // >>> ANGGA <<<
  campaignIntro: {
    id: 'Default global untuk campaign baru. Rate limit & jeda tetap bisa di-override per-campaign di halaman Campaigns.',
    en: 'Global defaults for new campaigns. Rate limit & delay can still be overridden per campaign on the Campaigns page.',
  },
  defaultRateLimit: { id: 'Rate limit default (pesan/menit)', en: 'Default rate limit (messages/minute)' },
  defaultRateLimitHint: { id: 'Dipakai saat campaign baru dibuat tanpa rate limit kustom.', en: 'Used when a new campaign is created without a custom rate limit.' },
  requireApproval: { id: 'Wajib approval sebelum kirim', en: 'Require approval before sending' },
  requireApprovalHint: { id: 'Saat aktif, campaign perlu disetujui reviewer lain (bukan pembuatnya) sebelum bisa dijalankan. Saat nonaktif, pembuat bisa langsung jalankan campaign sendiri.', en: 'When on, a campaign needs approval from a different reviewer (not its creator) before it can run. When off, the creator can start the campaign themselves.' },
};

type Tab = 'ai' | 'wa' | 'notif' | 'sentinel' | 'campaign';

interface SettingsShape {
  // >>> ANGGA: embedModel/embedDim ditambahkan (sakelar RAG)
  ai: { baseUrl: string; model: string; sentinelModel: string; temperature: number; timeoutMs: number; apiKeySet: boolean; embedModel: string; embedDim: number; ragMode?: 'hybrid' | 'agentic' };
  // <<< ANGGA
  wa: { humanDelayMinMs: number; humanDelayMaxMs: number; typingPerCharMs: number; typingMinMs: number; typingMaxMs: number };
  notifications: { hermesNotifyTarget: string };
  sla: { responseMinutes: number };
  sentinel: { autoSendConfidenceMin: number; draftConfidenceMin: number; riskKeywords: string; defaultAiMode: string };
  campaign: { defaultRateLimitPerMinute: number; requireApproval: boolean };
}

const fieldCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

export default function SettingsPage() {
  const t = useT(dict);
  // >>> ANGGA: dulu `hasRole('owner')` langsung — bikin hydration mismatch
  // karena server tidak punya token. Lihat lib/use-has-role.ts.
  const { allowed: canEdit, ready: roleReady } = useHasRole('owner');
  // <<< ANGGA
  const [tab, setTab] = useState<Tab>('ai');
  const [data, setData] = useState<SettingsShape | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsMsg, setModelsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // >>> ANGGA: state sakelar RAG. ragDirty mengunci tombol reindex sampai
  // perubahan disimpan — server memakai nilai dari DB, bukan isi form.
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ragDirty, setRagDirty] = useState(false);
  // <<< ANGGA

  useEffect(() => {
    api<SettingsShape>('/settings')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('loadError')));
  }, [t]);

  // Auto-load the full model list once instead of requiring a manual click —
  // loadModels() already fetches the provider's complete /models response.
  useEffect(() => {
    if (data && models.length === 0 && !loadingModels) loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function patch<K extends keyof SettingsShape>(cat: K, key: keyof SettingsShape[K], value: unknown) {
    setData((prev) => (prev ? { ...prev, [cat]: { ...prev[cat], [key]: value } } : prev));
    setSavedMsg(null);
  }

  async function testConnection() {
    setTestingConn(true);
    setTestResult(null);
    try {
      const list = await api<string[]>('/ai/models');
      setTestResult({ ok: true, msg: t('testOk', { n: list.length }) });
    } catch {
      setTestResult({ ok: false, msg: t('testFail') });
    } finally {
      setTestingConn(false);
    }
  }

  // >>> ANGGA: bangun ulang embedding untuk semua knowledge base.
  async function reindexAll() {
    setReindexing(true);
    setReindexMsg(null);
    try {
      const r = await api<{ enabled: boolean; bases: number; reindexed: number }>(
        '/knowledge/reindex-all',
        { method: 'POST' },
      );
      setReindexMsg(
        r.enabled
          ? { ok: true, msg: t('ragReindexOk', { n: r.reindexed, b: r.bases }) }
          : { ok: false, msg: t('ragReindexOff') },
      );
    } catch {
      setReindexMsg({ ok: false, msg: t('ragReindexFail') });
    } finally {
      setReindexing(false);
    }
  }
  // <<< ANGGA

  async function loadModels() {
    setLoadingModels(true);
    setModelsMsg(null);
    try {
      const list = await api<string[]>('/ai/models');
      const arr = Array.isArray(list) ? list : [];
      setModels(arr);
      if (arr.length === 0) setModelsMsg(t('noModels'));
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
          sentinelModel: data.ai.sentinelModel ?? '',
          temperature: Number(data.ai.temperature),
          timeoutMs: Number(data.ai.timeoutMs),
          ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
          // >>> ANGGA: sakelar RAG. embedModel kosong = RAG mati.
          embedModel: (data.ai.embedModel ?? '').trim(),
          embedDim: Number(data.ai.embedDim) || 1536,
          ragMode: data.ai.ragMode ?? 'hybrid',
          // <<< ANGGA
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
      } else if (tab === 'notif') {
        payload.notifications = { hermesNotifyTarget: data.notifications.hermesNotifyTarget };
        payload.sla = { responseMinutes: Number(data.sla.responseMinutes) };
      } else if (tab === 'sentinel') {
        if (Number(data.sentinel.draftConfidenceMin) >= Number(data.sentinel.autoSendConfidenceMin)) {
          setError(t('delayRangeError'));
          return;
        }
        payload.sentinel = {
          autoSendConfidenceMin: Number(data.sentinel.autoSendConfidenceMin),
          draftConfidenceMin: Number(data.sentinel.draftConfidenceMin),
          riskKeywords: data.sentinel.riskKeywords,
          defaultAiMode: data.sentinel.defaultAiMode,
        };
      } else if (tab === 'campaign') {
        payload.campaign = {
          defaultRateLimitPerMinute: Number(data.campaign.defaultRateLimitPerMinute),
          requireApproval: data.campaign.requireApproval,
        };
      }
      const updated = await api<SettingsShape>('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setData(updated);
      setApiKeyInput('');
      setSavedMsg(t('saved'));
      setRagDirty(false); // >>> ANGGA: buka kunci tombol reindex sesudah tersimpan
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
    { key: 'sentinel', label: t('tabSentinel'), icon: ShieldWarning },
    { key: 'campaign', label: t('tabCampaign'), icon: MegaphoneSimple },
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
                    ? 'border-sentinel-600 text-sentinel-700 dark:text-sentinel-300'
                    : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tb.label}
              </button>
            );
          })}
          {/* >>> ANGGA: rute terpisah (berkas ini sudah 640 baris, konvensi repo
              membatasi 400), tapi tetap tampil sebagai tab supaya terasa satu
              area Pengaturan. */}
          <Link
            href="/settings/shipping"
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            {t('tabShipping')}
          </Link>
          {/* <<< ANGGA */}
        </div>

        {/* >>> ANGGA: tunggu peran diketahui supaya spanduk ini tidak berkedip <<< */}
        {roleReady && !canEdit && (
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
                  <div className="flex gap-2">
                    <input className={fieldCls} disabled={!canEdit} value={data.ai.baseUrl}
                      onChange={(e) => { patch('ai', 'baseUrl', e.target.value); setTestResult(null); }} />
                    <Button variant="outline" size="sm" onClick={testConnection} disabled={testingConn || !data.ai.baseUrl} className="shrink-0">
                      <ArrowsClockwise className={cn('h-4 w-4', testingConn && 'animate-spin')} aria-hidden="true" />
                      {testingConn ? t('testingConnection') : t('testConnection')}
                    </Button>
                  </div>
                  {testResult && (
                    <p className={`mt-1 text-xs font-medium ${testResult.ok ? 'text-channel-700 dark:text-channel-400' : 'text-danger-700 dark:text-danger-400'}`}>
                      {testResult.msg}
                    </p>
                  )}
                </Field>
                <Field label={t('apiKey')} hint={data.ai.apiKeySet ? t('apiKeySet') : t('apiKeyEmpty')}>
                  <input type="password" className={fieldCls} disabled={!canEdit}
                    placeholder={data.ai.apiKeySet ? '••••••••' : ''}
                    value={apiKeyInput} onChange={(e) => { setApiKeyInput(e.target.value); setSavedMsg(null); }} />
                </Field>
                <Field label={t('model')}>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ModelSelect className="flex-1" disabled={!canEdit} value={data.ai.model} options={models}
                      onChange={(v) => patch('ai', 'model', v)} />
                    <Button variant="outline" size="sm" onClick={loadModels} disabled={loadingModels} className="shrink-0">
                      <ArrowsClockwise className={cn('h-4 w-4', loadingModels && 'animate-spin')} aria-hidden="true" />
                      {t('loadModels')}
                    </Button>
                  </div>
                  {modelsMsg && <p className="mt-1 text-xs text-gray-400">{modelsMsg}</p>}
                </Field>
                <Field label={t('sentinelModel')}>
                  <ModelSelect disabled={!canEdit} value={data.ai.sentinelModel ?? ''} options={models}
                    placeholder={data.ai.model} onChange={(v) => patch('ai', 'sentinelModel', v)} />
                  <p className="mt-1 text-xs text-gray-400">{t('sentinelModelHint')}</p>
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

                {/* >>> ANGGA: sakelar RAG — upstream hanya lewat env + restart */}
                <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="mb-2 text-[13px] font-semibold text-gray-800 dark:text-gray-100">{t('ragTitle')}</p>
                  <label className="flex items-start gap-2">
                    <input type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sentinel-600 focus:ring-sentinel-400 disabled:opacity-50"
                      disabled={!canEdit}
                      checked={!!(data.ai.embedModel ?? '').trim()}
                      onChange={(e) => {
                        // Default id model menyesuaikan provider: OpenRouter memakai
                        // penamaan ber-namespace, OpenAI tidak.
                        const viaOpenRouter = (data.ai.baseUrl ?? '').includes('openrouter');
                        patch('ai', 'embedModel', e.target.checked
                          ? (viaOpenRouter ? 'openai/text-embedding-3-small' : 'text-embedding-3-small')
                          : '');
                        setRagDirty(true);
                        setReindexMsg(null);
                      }} />
                    <span>
                      <span className="block text-[13px] font-medium text-gray-700 dark:text-gray-200">{t('ragToggle')}</span>
                      <span className="mt-0.5 block text-xs text-gray-400">{t('ragHint')}</span>
                    </span>
                  </label>

                  {!!(data.ai.embedModel ?? '').trim() && (
                    <div className="mt-3 space-y-3 border-l-2 border-gray-100 pl-4 dark:border-gray-800">
                      <Field label={t('ragModel')} hint={t('ragModelHint')}>
                        <input className={fieldCls} disabled={!canEdit}
                          value={data.ai.embedModel ?? ''}
                          onChange={(e) => { patch('ai', 'embedModel', e.target.value); setRagDirty(true); }} />
                      </Field>
                      <Field label={t('ragDim')} hint={t('ragDimHint')}>
                        <input type="number" min="64" max="8192" className={fieldCls} disabled={!canEdit}
                          value={data.ai.embedDim ?? 1536}
                          onChange={(e) => { patch('ai', 'embedDim', e.target.value); setRagDirty(true); }} />
                      </Field>
                      <Field label={t('ragMode')} hint={t('ragModeHint')}>
                        <select className={fieldCls} disabled={!canEdit}
                          value={data.ai.ragMode ?? 'hybrid'}
                          onChange={(e) => { patch('ai', 'ragMode', e.target.value as 'hybrid' | 'agentic'); setRagDirty(true); }}>
                          <option value="hybrid">{t('modeHybrid')}</option>
                          <option value="agentic">{t('modeAgentic')}</option>
                        </select>
                      </Field>
                      <div>
                        <Button variant="outline" size="sm" onClick={reindexAll}
                          disabled={reindexing || !canEdit || ragDirty}>
                          <ArrowsClockwise className={cn('h-4 w-4', reindexing && 'animate-spin')} aria-hidden="true" />
                          {reindexing ? t('ragReindexing') : t('ragReindex')}
                        </Button>
                        <p className="mt-1 text-xs text-gray-400">
                          {ragDirty ? t('ragDirty') : t('ragReindexHint')}
                        </p>
                        {reindexMsg && (
                          <p className={`mt-1 text-xs font-medium ${reindexMsg.ok ? 'text-channel-700 dark:text-channel-400' : 'text-danger-700 dark:text-danger-400'}`}>
                            {reindexMsg.msg}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* <<< ANGGA */}
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

            {tab === 'sentinel' && (
              <div className="space-y-4">
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('sentinelIntro')}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('autoSendMin')} hint={t('autoSendMinHint')}>
                    <input type="number" min="50" max="100" className={fieldCls} disabled={!canEdit}
                      value={data.sentinel.autoSendConfidenceMin}
                      onChange={(e) => patch('sentinel', 'autoSendConfidenceMin', e.target.value)} />
                  </Field>
                  <Field label={t('draftMin')} hint={t('draftMinHint')}>
                    <input type="number" min="0" max="99" className={fieldCls} disabled={!canEdit}
                      value={data.sentinel.draftConfidenceMin}
                      onChange={(e) => patch('sentinel', 'draftConfidenceMin', e.target.value)} />
                  </Field>
                </div>
                <Field label={t('riskKeywords')} hint={t('riskKeywordsHint')}>
                  <input className={fieldCls} disabled={!canEdit} placeholder="DP, transfer manual"
                    value={data.sentinel.riskKeywords}
                    onChange={(e) => patch('sentinel', 'riskKeywords', e.target.value)} />
                </Field>
                <Field label={t('defaultAiMode')} hint={t('defaultAiModeHint')}>
                  <select className={fieldCls} disabled={!canEdit}
                    value={data.sentinel.defaultAiMode}
                    onChange={(e) => patch('sentinel', 'defaultAiMode', e.target.value)}>
                    <option value="ai_off">{t('modeOff')}</option>
                    <option value="ai_draft">{t('modeDraft')}</option>
                    <option value="ai_supervised">{t('modeSupervised')}</option>
                    <option value="ai_on">{t('modeOn')}</option>
                  </select>
                </Field>
              </div>
            )}

            {tab === 'campaign' && (
              <div className="space-y-4">
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('campaignIntro')}</p>
                <Field label={t('defaultRateLimit')} hint={t('defaultRateLimitHint')}>
                  <input type="number" min="1" max="60" className={fieldCls} disabled={!canEdit}
                    value={data.campaign.defaultRateLimitPerMinute}
                    onChange={(e) => patch('campaign', 'defaultRateLimitPerMinute', e.target.value)} />
                </Field>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sentinel-600 focus:ring-sentinel-400 disabled:opacity-50"
                    disabled={!canEdit}
                    checked={data.campaign.requireApproval}
                    onChange={(e) => patch('campaign', 'requireApproval', e.target.checked)} />
                  <span>
                    <span className="block text-[13px] font-medium text-gray-700 dark:text-gray-200">{t('requireApproval')}</span>
                    <span className="mt-0.5 block text-xs text-gray-400">{t('requireApprovalHint')}</span>
                  </span>
                </label>
              </div>
            )}

            {canEdit && (
              <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button onClick={save} disabled={saving}>
                  <FloppyDisk className="h-4 w-4" aria-hidden="true" />
                  {saving ? t('saving') : t('save')}
                </Button>
                {savedMsg && <span className="text-[13px] font-medium text-sentinel-600">{savedMsg}</span>}
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

/** Searchable model picker — replaces the native <input list=datalist>, whose
 * popup can render outside the viewport and isn't stylable. Stays freeform
 * (typing a model id not in `options` is allowed). */
function ModelSelect({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const safeOptions = Array.isArray(options) ? options : [];
  const filtered = value
    ? safeOptions.filter((m) => m.toLowerCase().includes(value.toLowerCase()))
    : safeOptions;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <input
        className={fieldCls}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filtered.map((m) => (
            <li key={m}>
              <button
                type="button"
                className="block w-full truncate px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-sentinel-50 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => { onChange(m); setOpen(false); }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
