'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Plus,
  Smartphone,
  Unplug,
  QrCode,
  RotateCcw,
  Trash2,
  Activity,
} from 'lucide-react';
import { api, hasRole } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  subtitle: {
    id: 'Nomor WhatsApp, status koneksi, dan jam operasional',
    en: 'WhatsApp numbers, connection status, and business hours',
  },
  accountNameLabel: { id: 'Nama akun', en: 'Account name' },
  phoneLabel: { id: 'Nomor WhatsApp', en: 'WhatsApp number' },
  retry: { id: 'Coba lagi', en: 'Try again' },
  noAccounts: { id: 'Belum ada akun terhubung', en: 'No accounts connected yet' },
  noAccountsHint: {
    id: 'Tambah akun WhatsApp di atas untuk mulai menerima dan membalas pesan pelanggan.',
    en: 'Add a WhatsApp account above to start receiving and replying to customer messages.',
  },
  waitingScan: {
    id: 'Menunggu admin memindai kode QR.',
    en: 'Waiting for an admin to scan the QR code.',
  },
  loadFailed: { id: 'Gagal memuat daftar akun.', en: 'Failed to load the account list.' },
  addFailed: { id: 'Gagal menambahkan akun.', en: 'Failed to add the account.' },
  businessHoursToggle: {
    id: 'Jam operasional & pesan otomatis di luar jam',
    en: 'Business hours & after-hours auto-reply',
  },
  active: { id: ' (aktif)', en: ' (active)' },
  enableBusinessHours: { id: 'Aktifkan jam operasional', en: 'Enable business hours' },
  hours: { id: 'Jam', en: 'Hours' },
  startTime: { id: 'Jam mulai operasional', en: 'Business hours start time' },
  endTime: { id: 'Jam selesai operasional', en: 'Business hours end time' },
  timezone: { id: 'Zona waktu', en: 'Time zone' },
  awayLabel: { id: 'Pesan otomatis di luar jam', en: 'After-hours auto-reply' },
  awayHint: {
    id: 'Dikirim di luar jam operasional saat AI tidak aktif.',
    en: 'Sent outside business hours when the AI is inactive.',
  },
  awayPlaceholder: {
    id: 'Halo, saat ini di luar jam operasional. Pesan akan kami balas pada jam kerja ya kak.',
    en: "Hi, we're currently outside business hours. We'll reply during working hours.",
  },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  save: { id: 'Simpan', en: 'Save' },
  saved: { id: 'Tersimpan', en: 'Saved' },
  restart: { id: 'Restart', en: 'Restart' },
  restarting: { id: 'Merestart…', en: 'Restarting…' },
  delete: { id: 'Hapus', en: 'Delete' },
  deleteConfirm: {
    id: 'Hapus akun WhatsApp "{name}"? Semua data sesi akan dihapus. Tindakan ini tidak dapat dibatalkan.',
    en: 'Delete WhatsApp account "{name}"? All session data will be removed. This cannot be undone.',
  },
  deleting: { id: 'Menghapus…', en: 'Deleting…' },
  healthLive: { id: 'Socket aktif', en: 'Live socket' },
  healthReconnect: { id: 'Reconnect #{attempt}', en: 'Reconnect #{attempt}' },
};

interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus: string;
  businessHoursEnabled?: boolean;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessDays?: number[];
  businessTimezone?: string | null;
  awayMessage?: string | null;
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

type BadgeTone = 'success' | 'review' | 'danger' | 'neutral';

// Session status maps to the semantic connection scale.
const statusTone: Record<string, BadgeTone> = {
  connected: 'success',
  qr_required: 'review',
  connecting: 'review',
  disconnected: 'danger',
  banned: 'danger',
};

const inputClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function BusinessHoursEditor({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const t = useT(dict);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(account.businessHoursEnabled ?? false);
  const [start, setStart] = useState(account.businessHoursStart ?? '09:00');
  const [end, setEnd] = useState(account.businessHoursEnd ?? '17:00');
  const [days, setDays] = useState<number[]>(account.businessDays ?? [1, 2, 3, 4, 5]);
  const [tz, setTz] = useState(account.businessTimezone ?? 'Asia/Jakarta');
  const [away, setAway] = useState(account.awayMessage ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api(`/wa/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          businessHoursEnabled: enabled,
          businessHoursStart: start,
          businessHoursEnd: end,
          businessDays: days,
          businessTimezone: tz,
          awayMessage: away,
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-hermes-600 hover:text-hermes-700"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        )}
        {t('businessHoursToggle')}
        {account.businessHoursEnabled ? t('active') : ''}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-hermes-600" />
            <span className="text-gray-700 dark:text-gray-300">{t('enableBusinessHours')}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">{t('hours')}</span>
            <input type="time" aria-label={t('startTime')} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            <span className="text-gray-400">–</span>
            <input type="time" aria-label={t('endTime')} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  days.includes(d)
                    ? 'bg-hermes-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Field
            label={t('timezone')}
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Asia/Jakarta"
          />
          <TextareaField
            label={t('awayLabel')}
            hint={t('awayHint')}
            rows={2}
            value={away}
            onChange={(e) => setAway(e.target.value)}
            placeholder={t('awayPlaceholder')}
            className="resize-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-channel-700">
                <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t('saved')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const t = useT(dict);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qr, setQr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, { liveSocket: boolean; reconnectAttempts: number }>>({});
  const [restarting, setRestarting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // The QR grants full control of a WhatsApp number — only admins+ may scan.
  const canScan = hasRole('admin');
  const canEditHours = hasRole('supervisor');
  const canDelete = hasRole('supervisor');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api<Account[]>('/wa/accounts');
      setAccounts(items);
      // Fetch health for each account in parallel.
      const healthResults = await Promise.allSettled(
        items.map((a) => api<{ liveSocket: boolean; reconnectAttempts: number }>(`/wa/accounts/${a.id}/health`)),
      );
      const healthMap: Record<string, { liveSocket: boolean; reconnectAttempts: number }> = {};
      items.forEach((a, i) => {
        const r = healthResults[i];
        if (r.status === 'fulfilled') healthMap[a.id] = r.value;
      });
      setHealth(healthMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return;
    socket.on('wa:qr', ({ accountId, qr }: { accountId: string; qr: string }) =>
      setQr((prev) => ({ ...prev, [accountId]: qr })),
    );
    socket.on('wa:status', () => load());
    return () => {
      socket.off('wa:qr');
      socket.off('wa:status');
    };
  }, [load]);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ accountName: name, phoneNumber: phone }),
      });
      setName('');
      setPhone('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addFailed'));
    }
  }

  async function restartAccount(id: string) {
    setRestarting(id);
    try {
      await api(`/wa/accounts/${id}/restart`, { method: 'POST' });
      load();
    } catch { /* ignore */ }
    setRestarting(null);
  }

  async function deleteAccount(id: string, accountName: string) {
    const msg = t('deleteConfirm', { name: accountName });
    if (!window.confirm(msg)) return;
    setDeleting(id);
    try {
      await api(`/wa/accounts/${id}`, { method: 'DELETE' });
      load();
    } catch { /* ignore */ }
    setDeleting(null);
  }

  return (
    <AppLayout>
      <PageHeader title="Accounts" subtitle={t('subtitle')} />

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
        <Card className="mb-5 p-4">
          <form onSubmit={addAccount} className="flex flex-wrap gap-2">
            <input aria-label={t('accountNameLabel')} placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} className={`flex-1 ${inputClass}`} required />
            <input aria-label={t('phoneLabel')} placeholder="Number (e.g. 628123…)" value={phone} onChange={(e) => setPhone(e.target.value)} className={`flex-1 ${inputClass}`} required />
            <Button type="submit" size="md">
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Add account
            </Button>
          </form>
        </Card>

        {error && (
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-900/20">
            <p className="text-sm text-danger-700 dark:text-danger-300">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              {t('retry')}
            </Button>
          </Card>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 rounded animate-shimmer" />
            ))}
          </div>
        ) : accounts.length === 0 && !error ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800">
              <Smartphone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('noAccounts')}</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              {t('noAccountsHint')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {accounts.map((a) => {
              const disconnected = a.sessionStatus === 'disconnected' || a.sessionStatus === 'banned';
              return (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">
                          <Smartphone className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{a.accountName}</p>
                          <p className="text-xs text-gray-400">{a.phoneNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {health[a.id] && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-400" title={health[a.id].liveSocket ? t('healthLive') : t('healthReconnect', { attempt: String(health[a.id].reconnectAttempts) })}>
                            <Activity className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {health[a.id].liveSocket ? 'live' : `#${health[a.id].reconnectAttempts}`}
                          </span>
                        )}
                        <Badge tone={statusTone[a.sessionStatus] ?? 'neutral'}>
                          {disconnected && <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />}
                          {a.sessionStatus}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => restartAccount(a.id)}
                        disabled={restarting === a.id}
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {restarting === a.id ? t('restarting') : t('restart')}
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400"
                          onClick={() => deleteAccount(a.id, a.accountName)}
                          disabled={deleting === a.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {deleting === a.id ? t('deleting') : t('delete')}
                        </Button>
                      )}
                    </div>
                    {a.sessionStatus === 'qr_required' &&
                      (canScan && qr[a.id] ? (
                        <img src={qr[a.id]} alt="WhatsApp QR code" className="mt-4 h-48 w-48 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700" />
                      ) : (
                        !canScan && (
                          <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
                            <QrCode className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            {t('waitingScan')}
                          </p>
                        )
                      ))}
                    {canEditHours && <BusinessHoursEditor account={a} onSaved={load} />}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
