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
} from 'lucide-react';
import { api, hasRole } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';

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
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function BusinessHoursEditor({ account, onSaved }: { account: Account; onSaved: () => void }) {
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
        Jam operasional &amp; pesan otomatis di luar jam
        {account.businessHoursEnabled ? ' (aktif)' : ''}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-hermes-600" />
            <span className="text-gray-700 dark:text-gray-300">Aktifkan jam operasional</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Jam</span>
            <input type="time" aria-label="Jam mulai operasional" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            <span className="text-gray-400">–</span>
            <input type="time" aria-label="Jam selesai operasional" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
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
            label="Zona waktu"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Asia/Jakarta"
          />
          <TextareaField
            label="Pesan otomatis di luar jam"
            hint="Dikirim di luar jam operasional saat AI tidak aktif."
            rows={2}
            value={away}
            onChange={(e) => setAway(e.target.value)}
            placeholder="Halo, saat ini di luar jam operasional. Pesan akan kami balas pada jam kerja ya kak."
            className="resize-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-channel-700">
                <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Tersimpan
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qr, setQr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The QR grants full control of a WhatsApp number — only admins+ may scan.
  const canScan = hasRole('admin');
  const canEditHours = hasRole('supervisor');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api<Account[]>('/wa/accounts'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar akun.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
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
      setError(err instanceof Error ? err.message : 'Gagal menambahkan akun.');
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Accounts" subtitle="Nomor WhatsApp, status koneksi, dan jam operasional" />

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
        <Card className="mb-5 p-4">
          <form onSubmit={addAccount} className="flex flex-wrap gap-2">
            <input aria-label="Nama akun" placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} className={`flex-1 ${inputClass}`} required />
            <input aria-label="Nomor WhatsApp" placeholder="Number (e.g. 628123…)" value={phone} onChange={(e) => setPhone(e.target.value)} className={`flex-1 ${inputClass}`} required />
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
              Coba lagi
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Belum ada akun terhubung</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              Tambah akun WhatsApp di atas untuk mulai menerima dan membalas pesan pelanggan.
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
                      <Badge tone={statusTone[a.sessionStatus] ?? 'neutral'}>
                        {disconnected && <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />}
                        {a.sessionStatus}
                      </Badge>
                    </div>
                    {a.sessionStatus === 'qr_required' &&
                      (canScan && qr[a.id] ? (
                        <img src={qr[a.id]} alt="WhatsApp QR code" className="mt-4 h-48 w-48 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700" />
                      ) : (
                        !canScan && (
                          <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
                            <QrCode className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            Menunggu admin memindai kode QR.
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
