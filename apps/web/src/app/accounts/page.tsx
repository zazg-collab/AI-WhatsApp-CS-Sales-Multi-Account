'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Plus,
  DeviceMobile,
  PlugsConnected,
  QrCode,
  ArrowCounterClockwise,
  Trash,
  Pulse,
} from '@phosphor-icons/react';
import { api, hasRole } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
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
  pairingCodeTitle: {
    id: 'Kode Pairing (Alternatif)',
    en: 'Pairing Code (Alternative)',
  },
  pairingCodeHint: {
    id: 'Masukkan kode ini di WhatsApp → Pengaturan → Linked Devices',
    en: 'Enter this code in WhatsApp → Settings → Linked Devices',
  },
  qrFreshJustNow: { id: 'QR baru saja diperbarui', en: 'QR just refreshed' },
  qrFreshSecondsAgo: { id: 'Diperbarui {seconds}s lalu', en: 'Updated {seconds}s ago' },
  qrFreshStale: { id: 'QR mungkin sudah kedaluwarsa — menunggu pembaruan otomatis…', en: 'QR may be stale — waiting for an automatic refresh…' },
  qrAutoRefresh: { id: 'QR diperbarui otomatis oleh WhatsApp', en: 'WhatsApp refreshes this QR automatically' },
  copyCode: { id: 'Salin kode', en: 'Copy code' },
  codeCopied: { id: 'Kode disalin!', en: 'Code copied!' },
  switchToQr: { id: 'Tampilkan QR', en: 'Show QR' },
  switchToPairingCode: { id: 'Tampilkan Kode Pairing', en: 'Show Pairing Code' },
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
  deleteConfirmTitle: { id: 'Hapus akun WhatsApp?', en: 'Delete WhatsApp account?' },
  cancel: { id: 'Batal', en: 'Cancel' },
  deleting: { id: 'Menghapus…', en: 'Deleting…' },
  healthLive: { id: 'Socket aktif', en: 'Live socket' },
  healthReconnect: { id: 'Reconnect #{attempt}', en: 'Reconnect #{attempt}' },
  // Status copy
  statusConnected: { id: 'Terhubung', en: 'Connected' },
  statusConnecting: { id: 'Sedang terhubung...', en: 'Connecting...' },
  statusReconnecting: { id: 'Menyambung ulang...', en: 'Reconnecting...' },
  statusQrRequired: { id: 'Perlu scan ulang', en: 'Needs re-scan' },
  statusDisconnected: { id: 'Terputus', en: 'Disconnected' },
  statusBanned: { id: 'Akun ditangguhkan WhatsApp', en: 'WhatsApp suspended' },
  statusPaused: { id: 'Dijeda manual', en: 'Manually paused' },
  reconnectHint: {
    id: 'Reconnect otomatis sedang berjalan. Jika berlanjut, scan QR ulang.',
    en: 'Auto-reconnect in progress. If it persists, re-scan the QR.',
  },
  reconnectingHint: {
    id: 'Sesi terputus sebentar dan sedang disambungkan kembali otomatis. Pesan akan tertunda sampai tersambung.',
    en: 'Session dropped briefly and is auto-reconnecting. Messages will queue until it reconnects.',
  },
  qrExpiredHint: {
    id: 'QR kadaluwarsa. Klik "Coba lagi" untuk muat QR baru.',
    en: 'QR expired. Click "Try again" to load a new QR.',
  },
  bannedHint: {
    id: 'WhatsApp mendeteksi aktivitas mencurigakan. Hubungi support WhatsApp atau coba akun lain.',
    en: 'WhatsApp detected suspicious activity. Contact WhatsApp support or try another account.',
  },
  pausedHint: {
    id: 'Akun ini dijeda secara manual dan tidak akan mengirim/menerima pesan sampai diaktifkan kembali.',
    en: 'This account is manually paused and will not send/receive until reactivated.',
  },
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
  reconnecting: 'review',
  disconnected: 'danger',
  banned: 'danger',
  paused: 'neutral',
};

// Map raw status to operator-friendly copy
function getStatusLabel(status: string, t: ReturnType<typeof useT>): { label: string; hint?: string } {
  const map: Record<string, { label: string; hint?: string }> = {
    connected: { label: t('statusConnected') },
    connecting: { label: t('statusConnecting'), hint: t('reconnectHint') },
    reconnecting: { label: t('statusReconnecting'), hint: t('reconnectingHint') },
    qr_required: { label: t('statusQrRequired'), hint: t('qrExpiredHint') },
    disconnected: { label: t('statusDisconnected'), hint: t('reconnectHint') },
    banned: { label: t('statusBanned'), hint: t('bannedHint') },
    paused: { label: t('statusPaused'), hint: t('pausedHint') },
  };
  return map[status] || { label: status };
}

function QrFreshness({ receivedAt, t }: { receivedAt: number; t: ReturnType<typeof useT> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor((now - receivedAt) / 1000);
  const stale = seconds >= 45;
  return (
    <p className={`mt-2 text-center text-[11px] ${stale ? 'text-review-600 dark:text-review-400' : 'text-gray-400'}`}>
      {stale ? t('qrFreshStale') : seconds < 2 ? t('qrFreshJustNow') : t('qrFreshSecondsAgo', { seconds: String(seconds) })}
    </p>
  );
}

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
          <CaretDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <CaretRight className="h-3.5 w-3.5" aria-hidden="true" />
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
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
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
  const [qrReceivedAt, setQrReceivedAt] = useState<Record<string, number>>({});
  const [pairingCode, setPairingCode] = useState<Record<string, string>>({});
  const [pairingMode, setPairingMode] = useState<Record<string, 'qr' | 'code'>>({});
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, { liveSocket: boolean; reconnectAttempts: number }>>({});
  const [restarting, setRestarting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; accountName: string } | null>(null);
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
    socket.on('wa:qr', ({ accountId, qr }: { accountId: string; qr: string }) => {
      setQr((prev) => ({ ...prev, [accountId]: qr }));
      setQrReceivedAt((prev) => ({ ...prev, [accountId]: Date.now() }));
    });
    socket.on('wa:pairing-code', ({ accountId, code }: { accountId: string; code: string }) => {
      setPairingCode((prev) => ({ ...prev, [accountId]: code }));
      setPairingMode((prev) => ({ ...prev, [accountId]: 'code' }));
    });
    socket.on('wa:status', () => load());
    return () => {
      socket.off('wa:qr');
      socket.off('wa:pairing-code');
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

  async function deleteAccount(id: string) {
    setDeleting(id);
    try {
      await api(`/wa/accounts/${id}`, { method: 'DELETE' });
      load();
    } catch { /* ignore */ }
    setDeleting(null);
    setConfirmDelete(null);
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
              <Plus className="h-4 w-4" aria-hidden="true" />
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
              <DeviceMobile className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('noAccounts')}</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              {t('noAccountsHint')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {accounts.map((a) => {
              const disconnected = a.sessionStatus === 'disconnected' || a.sessionStatus === 'banned' || a.sessionStatus === 'reconnecting';
              return (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">
                          <DeviceMobile className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{a.accountName}</p>
                          <p className="text-xs text-gray-400">{a.phoneNumber}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          {health[a.id] && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400" title={health[a.id].liveSocket ? t('healthLive') : t('healthReconnect', { attempt: String(health[a.id].reconnectAttempts) })}>
                              <Pulse className="h-3 w-3" aria-hidden="true" />
                              {health[a.id].liveSocket ? 'live' : `retry #${health[a.id].reconnectAttempts}`}
                            </span>
                          )}
                          <Badge tone={statusTone[a.sessionStatus] ?? 'neutral'}>
                            {disconnected && <PlugsConnected className="h-3.5 w-3.5" aria-hidden="true" />}
                            {getStatusLabel(a.sessionStatus, t).label}
                          </Badge>
                        </div>
                        {getStatusLabel(a.sessionStatus, t).hint && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-right max-w-xs">
                            {getStatusLabel(a.sessionStatus, t).hint}
                          </p>
                        )}
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
                        <ArrowCounterClockwise className="h-3.5 w-3.5" aria-hidden="true" />
                        {restarting === a.id ? t('restarting') : t('restart')}
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400"
                          onClick={() => setConfirmDelete({ id: a.id, accountName: a.accountName })}
                          disabled={deleting === a.id}
                        >
                          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                          {deleting === a.id ? t('deleting') : t('delete')}
                        </Button>
                      )}
                    </div>
                    {a.sessionStatus === 'qr_required' &&
                      (canScan ? (
                        <div className="mt-4">
                          {(qr[a.id] || pairingCode[a.id]) && (
                            <div className="mb-3 flex gap-2">
                              {qr[a.id] && (
                                <button
                                  type="button"
                                  onClick={() => setPairingMode((prev) => ({ ...prev, [a.id]: 'qr' }))}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                                    pairingMode[a.id] !== 'code'
                                      ? 'bg-hermes-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {t('switchToQr')}
                                </button>
                              )}
                              {pairingCode[a.id] && (
                                <button
                                  type="button"
                                  onClick={() => setPairingMode((prev) => ({ ...prev, [a.id]: 'code' }))}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                                    pairingMode[a.id] === 'code'
                                      ? 'bg-hermes-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {t('switchToPairingCode')}
                                </button>
                              )}
                            </div>
                          )}
                          {pairingMode[a.id] === 'code' && pairingCode[a.id] ? (
                            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t('pairingCodeTitle')}</p>
                              <p className="mb-3 text-[32px] font-mono font-bold tracking-widest text-gray-900 dark:text-gray-100 text-center">
                                {pairingCode[a.id].replace(/(.{4})/, '$1-')}
                              </p>
                              <p className="mb-3 text-xs text-gray-600 dark:text-gray-400 text-center">{t('pairingCodeHint')}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(pairingCode[a.id]);
                                  setCopiedAccountId(a.id);
                                  setTimeout(() => setCopiedAccountId(null), 2000);
                                }}
                                className="w-full rounded-lg bg-hermes-600 px-3 py-2 text-sm font-medium text-white hover:bg-hermes-700 transition-colors"
                              >
                                {copiedAccountId === a.id ? t('codeCopied') : t('copyCode')}
                              </button>
                            </div>
                          ) : qr[a.id] ? (
                            <div>
                              <img src={qr[a.id]} alt="WhatsApp QR code" className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700" />
                              {qrReceivedAt[a.id] ? (
                                <QrFreshness receivedAt={qrReceivedAt[a.id]} t={t} />
                              ) : (
                                <p className="mt-2 text-center text-[11px] text-gray-400">{t('qrAutoRefresh')}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">{t('waitingScan')}</p>
                          )}
                        </div>
                      ) : (
                        !canScan && (
                          <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
                            <QrCode className="h-4 w-4" aria-hidden="true" />
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

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('deleteConfirmTitle')}
        description={confirmDelete ? t('deleteConfirm', { name: confirmDelete.accountName }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              className="bg-danger-600 hover:bg-danger-700"
              disabled={!!deleting}
              onClick={() => confirmDelete && deleteAccount(confirmDelete.id)}
            >
              {deleting ? t('deleting') : t('delete')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </AppLayout>
  );
}
