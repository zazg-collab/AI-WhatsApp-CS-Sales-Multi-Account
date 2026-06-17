'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Plus,
  DeviceMobile,
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
import { Field, TextareaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SessionStatusBadge, getSessionLabel } from '@/components/ui/SessionStatusBadge';
import { useT, type Dict, useLang } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Accounts', en: 'Accounts' },
  addAccount: { id: 'Tambah akun', en: 'Add account' },
  accountNamePlaceholder: { id: 'mis. CS Tokopedia, Sales Jakarta', en: 'e.g. CS Tokopedia, Sales Jakarta' },
  phonePlaceholder: { id: '628123456789 (tanpa + atau spasi)', en: '628123456789 (no + or spaces)' },

  // Add account modal
  addModalTitle: { id: 'Tambah akun WhatsApp', en: 'Add WhatsApp account' },
  addModalDesc: { id: 'Masukkan nama dan nomor akun WhatsApp yang akan dihubungkan.', en: 'Enter the name and number of the WhatsApp account to connect.' },
  stepDetails: { id: 'Detail akun', en: 'Account details' },
  stepConnect: { id: 'Hubungkan', en: 'Connect' },
  nameLabel: { id: 'Nama akun', en: 'Account name' },
  nameHint: { id: 'Gunakan nama yang mudah dikenali tim, mis. CS Utama atau Sales B2B.', en: 'Use a name your team will recognise, e.g. Main CS or B2B Sales.' },
  phoneLabel2: { id: 'Nomor WhatsApp', en: 'WhatsApp number' },
  phoneHint: { id: 'Format internasional tanpa + atau spasi, mis. 628123456789.', en: 'International format without + or spaces, e.g. 628123456789.' },
  creating: { id: 'Membuat akun…', en: 'Creating account…' },
  next: { id: 'Buat & hubungkan', en: 'Create & connect' },
  connectIntro: { id: 'Pilih cara menghubungkan akun WhatsApp ini:', en: 'Choose how to connect this WhatsApp account:' },
  optionQr: { id: 'Scan kode QR', en: 'Scan QR code' },
  optionQrDesc: { id: 'Buka WhatsApp → kode QR → arahkan kamera ke layar ini.', en: 'Open WhatsApp → QR code → point your camera at this screen.' },
  optionCode: { id: 'Kode pairing (tanpa kamera)', en: 'Pairing code (no camera)' },
  optionCodeDesc: { id: 'Masukkan kode 8 digit di WhatsApp → Pengaturan → Perangkat Tertaut.', en: 'Enter an 8-digit code in WhatsApp → Settings → Linked Devices.' },
  waitingQr: { id: 'Menunggu kode QR dari WhatsApp…', en: 'Waiting for QR code from WhatsApp…' },
  connectedSuccess: { id: 'Akun berhasil terhubung!', en: 'Account connected successfully!' },
  connectedClose: { id: 'Selesai', en: 'Done' },
  back: { id: 'Kembali', en: 'Back' },
  restartConfirmTitle: { id: 'Restart koneksi akun?', en: 'Restart account connection?' },
  restartConfirmBody: {
    id: 'Sesi WhatsApp "{name}" akan diputus lalu disambungkan ulang. Pesan masuk/keluar tertunda beberapa saat. Lanjutkan?',
    en: 'The WhatsApp session for "{name}" will drop and reconnect. Inbound/outbound messages pause briefly. Continue?',
  },
  restartConfirmAction: { id: 'Ya, restart', en: 'Yes, restart' },
  restartFailed: { id: 'Gagal merestart akun. Coba lagi.', en: 'Failed to restart the account. Try again.' },
  deleteFailed: { id: 'Gagal menghapus akun. Coba lagi.', en: 'Failed to delete the account. Try again.' },
  dismiss: { id: 'Tutup', en: 'Dismiss' },
  filterAll: { id: 'Semua status', en: 'All statuses' },
  filterConnected: { id: 'Terhubung', en: 'Connected' },
  filterDisconnected: { id: 'Terputus', en: 'Disconnected' },
  filterQr: { id: 'Perlu scan', en: 'Needs scan' },
  filterBanned: { id: 'Ditangguhkan', en: 'Banned' },
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
  requestPairingCode: { id: 'Minta kode pairing', en: 'Request pairing code' },
  requestingPairingCode: { id: 'Meminta kode…', en: 'Requesting code…' },
  pairingCodeFailed: { id: 'Gagal meminta kode pairing. Pastikan nomor HP sudah diatur dan coba lagi.', en: 'Failed to request pairing code. Make sure the phone number is set and try again.' },
  pairingCodeStep1: { id: '1. Buka WhatsApp di ponsel Anda', en: '1. Open WhatsApp on your phone' },
  pairingCodeStep2: { id: '2. Buka Pengaturan → Perangkat Tertaut → Tautkan Perangkat', en: '2. Go to Settings → Linked Devices → Link a Device' },
  pairingCodeStep3: { id: '3. Pilih "Tautkan dengan nomor telepon" dan masukkan kode di bawah ini', en: '3. Tap "Link with phone number" and enter the code below' },
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

// Map session status to its context hint key (kept local — hints contain WhatsApp-specific guidance)
function getStatusHint(status: string, t: ReturnType<typeof useT>): string | undefined {
  const map: Record<string, string> = {
    connecting: t('reconnectHint'),
    reconnecting: t('reconnectingHint'),
    qr_required: t('qrExpiredHint'),
    disconnected: t('reconnectHint'),
    banned: t('bannedHint'),
    paused: t('pausedHint'),
  };
  return map[status];
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
  const { lang } = useLang();
  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const [confirmRestart, setConfirmRestart] = useState<{ id: string; accountName: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [requestingCode, setRequestingCode] = useState<Record<string, boolean>>({});

  // Add-account modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<'details' | 'connect'>('details');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addCreating, setAddCreating] = useState(false);
  const [addedAccountId, setAddedAccountId] = useState<string | null>(null);
  const [addConnectMethod, setAddConnectMethod] = useState<'qr' | 'code' | null>(null);
  const [addRequestingCode, setAddRequestingCode] = useState(false);
  const [addConnected, setAddConnected] = useState(false);
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
    socket.on('wa:status', ({ accountId: sid, status }: { accountId: string; status: string }) => {
      load();
      // If the account just connected while the add-modal is open, celebrate.
      if (status === 'connected') {
        setAddedAccountId((prev) => { if (prev === sid) setAddConnected(true); return prev; });
      }
    });
    return () => {
      socket.off('wa:qr');
      socket.off('wa:pairing-code');
      socket.off('wa:status');
    };
  }, [load]);

  // Legacy: kept for compat but no longer called from inline form.
  function openAddModal() {
    setAddModalOpen(true);
    setAddStep('details');
    setAddName('');
    setAddPhone('');
    setAddError(null);
    setAddCreating(false);
    setAddedAccountId(null);
    setAddConnectMethod(null);
    setAddConnected(false);
  }

  const closeAddModal = useCallback(() => {
    setAddModalOpen(false);
    load(); // refresh list in case account was partially created
  }, [load]);

  async function handleAddCreate() {
    if (!addName.trim() || !addPhone.trim()) return;
    setAddCreating(true);
    setAddError(null);
    try {
      const account = await api<{ id: string }>('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ accountName: addName.trim(), phoneNumber: addPhone.trim() }),
      });
      setAddedAccountId(account.id);
      setAddStep('connect');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('addFailed'));
    } finally {
      setAddCreating(false);
    }
  }

  async function handleAddRequestPairingCode() {
    if (!addedAccountId) return;
    setAddRequestingCode(true);
    setAddError(null);
    try {
      const { code } = await api<{ code: string }>(`/wa/accounts/${addedAccountId}/request-pairing-code`, { method: 'POST' });
      setPairingCode((prev) => ({ ...prev, [addedAccountId]: code }));
      setPairingMode((prev) => ({ ...prev, [addedAccountId]: 'code' }));
      setAddConnectMethod('code');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t('pairingCodeFailed'));
    } finally {
      setAddRequestingCode(false);
    }
  }

  async function restartAccount(id: string) {
    setRestarting(id);
    setActionError(null);
    try {
      await api(`/wa/accounts/${id}/restart`, { method: 'POST' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('restartFailed'));
    }
    setRestarting(null);
    setConfirmRestart(null);
  }

  async function requestPairingCode(id: string) {
    setRequestingCode((prev) => ({ ...prev, [id]: true }));
    setActionError(null);
    try {
      const { code } = await api<{ code: string }>(`/wa/accounts/${id}/request-pairing-code`, { method: 'POST' });
      // Backend also pushes via socket — this handles the REST response as a fallback.
      setPairingCode((prev) => ({ ...prev, [id]: code }));
      setPairingMode((prev) => ({ ...prev, [id]: 'code' }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('pairingCodeFailed'));
    } finally {
      setRequestingCode((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function deleteAccount(id: string) {
    setDeleting(id);
    setActionError(null);
    try {
      await api(`/wa/accounts/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    }
    setDeleting(null);
    setConfirmDelete(null);
  }

  // Risk-first sort: banned/disconnected → qr_required → reconnecting → connected
  const STATUS_PRIORITY: Record<string, number> = {
    banned: 0,
    disconnected: 1,
    qr_required: 2,
    reconnecting: 3,
    paused: 4,
    connecting: 5,
    connected: 6,
  };

  const visibleAccounts = accounts
    .filter((a) => !statusFilter || a.sessionStatus === statusFilter)
    .sort((a, b) => (STATUS_PRIORITY[a.sessionStatus] ?? 7) - (STATUS_PRIORITY[b.sessionStatus] ?? 7));

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Button size="sm" onClick={openAddModal} disabled={!canScan}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('addAccount')}
        </Button>
      </PageHeader>

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">

        {accounts.length > 1 && (
          <div className="mb-3 flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass + ' w-48'}
              aria-label={t('filterAll')}
            >
              <option value="">{t('filterAll')}</option>
              <option value="connected">{t('filterConnected')}</option>
              <option value="disconnected">{t('filterDisconnected')}</option>
              <option value="qr_required">{t('filterQr')}</option>
              <option value="banned">{t('filterBanned')}</option>
            </select>
          </div>
        )}

        {actionError && (
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-900/20">
            <p className="text-sm text-danger-700 dark:text-danger-300">{actionError}</p>
            <Button variant="outline" size="sm" onClick={() => setActionError(null)}>
              {t('dismiss')}
            </Button>
          </Card>
        )}

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
            {visibleAccounts.map((a) => {
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
                          <SessionStatusBadge
                            status={a.sessionStatus}
                            lang={lang}
                            label={getSessionLabel(a.sessionStatus, lang)}
                          />
                        </div>
                        {getStatusHint(a.sessionStatus, t) && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-right max-w-xs">
                            {getStatusHint(a.sessionStatus, t)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRestart({ id: a.id, accountName: a.accountName })}
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
                          {/* Mode toggle — only visible when both options are available */}
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

                          {/* Pairing code panel */}
                          {pairingMode[a.id] === 'code' && pairingCode[a.id] ? (
                            <div className="rounded-lg border border-hermes-200 bg-hermes-50 p-4 dark:border-hermes-700/40 dark:bg-hermes-900/20">
                              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-hermes-700 dark:text-hermes-400">
                                {t('pairingCodeTitle')}
                              </p>
                              {/* Step-by-step instructions */}
                              <ol className="mb-4 space-y-1 text-[12px] text-gray-600 dark:text-gray-300">
                                <li>{t('pairingCodeStep1')}</li>
                                <li>{t('pairingCodeStep2')}</li>
                                <li>{t('pairingCodeStep3')}</li>
                              </ol>
                              {/* Large formatted code */}
                              <p className="mb-3 select-all text-center text-[36px] font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
                                {pairingCode[a.id].length === 8
                                  ? `${pairingCode[a.id].slice(0, 4)}-${pairingCode[a.id].slice(4)}`
                                  : pairingCode[a.id]}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(pairingCode[a.id]);
                                  setCopiedAccountId(a.id);
                                  setTimeout(() => setCopiedAccountId(null), 2000);
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-hermes-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-hermes-700"
                              >
                                {copiedAccountId === a.id ? (
                                  <><CheckCircle className="h-4 w-4" aria-hidden="true" />{t('codeCopied')}</>
                                ) : (
                                  <><QrCode className="h-4 w-4" aria-hidden="true" />{t('copyCode')}</>
                                )}
                              </button>
                            </div>
                          ) : qr[a.id] ? (
                            /* QR code panel */
                            <div className="flex flex-col items-center gap-2">
                              <img
                                src={qr[a.id]}
                                alt="WhatsApp QR code"
                                className="h-52 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700"
                              />
                              {qrReceivedAt[a.id] ? (
                                <QrFreshness receivedAt={qrReceivedAt[a.id]} t={t} />
                              ) : (
                                <p className="text-[11px] text-gray-400">{t('qrAutoRefresh')}</p>
                              )}
                              {/* Offer pairing code as alternative */}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestPairingCode(a.id)}
                                disabled={requestingCode[a.id]}
                                className="mt-1"
                              >
                                <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                                {requestingCode[a.id] ? t('requestingPairingCode') : t('requestPairingCode')}
                              </Button>
                            </div>
                          ) : (
                            /* No QR yet — offer to request pairing code immediately */
                            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-6 dark:border-gray-700">
                              <QrCode className="h-8 w-8 text-gray-300" aria-hidden="true" />
                              <p className="text-xs text-gray-500">{t('waitingScan')}</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestPairingCode(a.id)}
                                disabled={requestingCode[a.id]}
                              >
                                <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                                {requestingCode[a.id] ? t('requestingPairingCode') : t('requestPairingCode')}
                              </Button>
                            </div>
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

      <Modal
        open={!!confirmRestart}
        onClose={() => setConfirmRestart(null)}
        title={t('restartConfirmTitle')}
        description={confirmRestart ? t('restartConfirmBody', { name: confirmRestart.accountName }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmRestart(null)}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!!restarting}
              onClick={() => confirmRestart && restartAccount(confirmRestart.id)}
            >
              {restarting ? t('restarting') : t('restartConfirmAction')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>

      {/* ── Add Account Modal ─────────────────────────────────────────── */}
      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title={t('addModalTitle')}
        description={addStep === 'details' ? t('addModalDesc') : undefined}
        size="sm"
        footer={
          addStep === 'details' ? (
            <>
              <Button variant="outline" size="sm" onClick={closeAddModal}>{t('cancel')}</Button>
              <Button
                size="sm"
                disabled={addCreating || !addName.trim() || !addPhone.trim()}
                onClick={handleAddCreate}
              >
                {addCreating ? t('creating') : t('next')}
              </Button>
            </>
          ) : addConnected ? (
            <Button size="sm" onClick={closeAddModal} className="w-full">
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              {t('connectedClose')}
            </Button>
          ) : (
            addConnectMethod === null ? (
              <Button variant="outline" size="sm" onClick={closeAddModal}>{t('cancel')}</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { setAddConnectMethod(null); }}>
                {t('back')}
              </Button>
            )
          )
        }
      >
        {addStep === 'details' ? (
          /* ── Step 1: name + phone ── */
          <div className="space-y-4">
            {addError && (
              <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
                {addError}
              </p>
            )}
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
                {t('nameLabel')} <span className="text-danger-500">*</span>
              </label>
              <input
                autoFocus
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) document.getElementById('add-phone-input')?.focus(); }}
                placeholder={t('accountNamePlaceholder')}
                className={`w-full ${inputClass}`}
              />
              <p className="mt-1 text-[11px] text-gray-400">{t('nameHint')}</p>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">
                {t('phoneLabel2')} <span className="text-danger-500">*</span>
              </label>
              <input
                id="add-phone-input"
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim() && addPhone.trim()) handleAddCreate(); }}
                placeholder={t('phonePlaceholder')}
                className={`w-full ${inputClass}`}
              />
              <p className="mt-1 text-[11px] text-gray-400">{t('phoneHint')}</p>
            </div>
          </div>
        ) : (
          /* ── Step 2: connect ── */
          <div>
            {addError && (
              <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
                {addError}
              </p>
            )}

            {addConnected ? (
              /* Success state */
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-channel-50 dark:bg-channel-900/20">
                  <CheckCircle className="h-8 w-8 text-channel-600" aria-hidden="true" weight="fill" />
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('connectedSuccess')}</p>
                <p className="text-[12px] text-gray-500">{addName}</p>
              </div>
            ) : addConnectMethod === null ? (
              /* Method picker */
              <div className="space-y-3">
                <p className="mb-4 text-[13px] text-gray-500 dark:text-gray-400">{t('connectIntro')}</p>

                {/* QR option */}
                <button
                  type="button"
                  onClick={() => setAddConnectMethod('qr')}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-hermes-400 hover:bg-hermes-50 dark:border-gray-700 dark:hover:border-hermes-500 dark:hover:bg-hermes-900/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hermes-100 text-hermes-700 dark:bg-hermes-900/40">
                    <QrCode className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('optionQr')}</p>
                    <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{t('optionQrDesc')}</p>
                  </div>
                </button>

                {/* Pairing code option */}
                <button
                  type="button"
                  onClick={handleAddRequestPairingCode}
                  disabled={addRequestingCode}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-hermes-400 hover:bg-hermes-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:hover:border-hermes-500 dark:hover:bg-hermes-900/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800">
                    <DeviceMobile className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('optionCode')}</p>
                    <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{t('optionCodeDesc')}</p>
                    {addRequestingCode && (
                      <p className="mt-1 text-[11px] font-medium text-hermes-600">{t('requestingPairingCode')}</p>
                    )}
                  </div>
                </button>
              </div>
            ) : addConnectMethod === 'code' && addedAccountId && pairingCode[addedAccountId] ? (
              /* Show pairing code */
              <div className="rounded-xl border border-hermes-200 bg-hermes-50 p-4 dark:border-hermes-700/40 dark:bg-hermes-900/20">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-hermes-700 dark:text-hermes-400">
                  {t('pairingCodeTitle')}
                </p>
                <ol className="mb-4 space-y-1.5 text-[12px] text-gray-600 dark:text-gray-300">
                  <li>{t('pairingCodeStep1')}</li>
                  <li>{t('pairingCodeStep2')}</li>
                  <li>{t('pairingCodeStep3')}</li>
                </ol>
                <p className="mb-3 select-all text-center text-[40px] font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
                  {pairingCode[addedAccountId].length === 8
                    ? `${pairingCode[addedAccountId].slice(0, 4)}-${pairingCode[addedAccountId].slice(4)}`
                    : pairingCode[addedAccountId]}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!addedAccountId) return;
                    navigator.clipboard.writeText(pairingCode[addedAccountId]);
                    setCopiedAccountId(addedAccountId);
                    setTimeout(() => setCopiedAccountId(null), 2000);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-hermes-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-hermes-700"
                >
                  {addedAccountId && copiedAccountId === addedAccountId
                    ? <><CheckCircle className="h-4 w-4" />{t('codeCopied')}</>
                    : <><QrCode className="h-4 w-4" />{t('copyCode')}</>}
                </button>
              </div>
            ) : addConnectMethod === 'qr' && addedAccountId ? (
              /* Show QR */
              <div className="flex flex-col items-center gap-3">
                {qr[addedAccountId] ? (
                  <>
                    <img
                      src={qr[addedAccountId]}
                      alt="WhatsApp QR code"
                      className="h-56 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700"
                    />
                    {qrReceivedAt[addedAccountId] && (
                      <QrFreshness receivedAt={qrReceivedAt[addedAccountId]} t={t} />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 px-8 py-10 dark:border-gray-700">
                    <QrCode className="h-10 w-10 text-gray-300" aria-hidden="true" />
                    <p className="text-center text-[13px] text-gray-500">{t('waitingQr')}</p>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-hermes-400 border-t-transparent" aria-hidden="true" />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
