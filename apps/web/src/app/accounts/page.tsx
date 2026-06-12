'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, hasRole } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';

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
    <div className="mt-3 border-t border-gray-200 dark:border-black/30 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-wa-accent hover:underline"
      >
        {open ? '▾' : '▸'} Jam operasional & auto-away
        {account.businessHoursEnabled ? ' (aktif)' : ''}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Aktifkan jam operasional</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">Jam</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded bg-black/5 dark:bg-black/30 px-2 py-1" />
            <span className="text-gray-500">–</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded bg-black/5 dark:bg-black/30 px-2 py-1" />
          </div>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`rounded px-2 py-1 text-xs ${days.includes(d) ? 'bg-wa-accent text-black' : 'bg-black/5 dark:bg-black/30 text-gray-600 dark:text-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Timezone</label>
            <input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Jakarta" className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Pesan auto-away (di luar jam, saat AI tidak ON)</label>
            <textarea
              rows={2}
              value={away}
              onChange={(e) => setAway(e.target.value)}
              placeholder="Halo kak, saat ini di luar jam operasional. Kami balas pada jam kerja ya 🙏"
              className="w-full resize-none rounded bg-black/5 dark:bg-black/30 px-2 py-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="rounded bg-wa-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
            {saved && <span className="text-xs text-emerald-400">Tersimpan ✓</span>}
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
  const [error, setError] = useState<string | null>(null);
  // M7: the QR grants full control of a WhatsApp number — only admins+ may scan.
  const canScan = hasRole('admin');
  const canEditHours = hasRole('supervisor');
  const canDelete = hasRole('supervisor');

  const load = useCallback(async () => {
    try {
      setAccounts(await api<Account[]>('/wa/accounts'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat');
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
      setError(err instanceof Error ? err.message : 'Gagal menambah');
    }
  }

  return (
    <AppLayout><main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-xl font-semibold text-wa-accent">
        Nomor WhatsApp
      </h1>

      <form onSubmit={addAccount} className="mb-8 flex gap-2">
        <input
          placeholder="Nama akun"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded bg-white dark:bg-wa-panel px-3 py-2 outline-none"
          required
        />
        <input
          placeholder="Nomor (mis. 628123...)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 rounded bg-white dark:bg-wa-panel px-3 py-2 outline-none"
          required
        />
        <button className="rounded bg-wa-accent px-4 font-medium text-black">
          Tambah
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <ul className="space-y-4">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-lg bg-white dark:bg-wa-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{a.accountName}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{a.phoneNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-black/10 dark:bg-black/40 px-2 py-1 text-xs">
                  {a.sessionStatus}
                </span>
                {canDelete && (
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Hapus akun "${a.accountName}" (${a.phoneNumber})? Semua percakapan dan data terkait akan dihapus.`)) return;
                      try {
                        await api(`/wa/accounts/${a.id}`, { method: 'DELETE' });
                        load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Gagal menghapus');
                      }
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                    title="Hapus akun"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>
            {a.sessionStatus === 'qr_required' &&
              (canScan && qr[a.id] ? (
                <img
                  src={qr[a.id]}
                  alt="QR"
                  className="mt-4 h-48 w-48 rounded bg-white p-2"
                />
              ) : (
                !canScan && (
                  <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
                    Menunggu admin untuk memindai QR.
                  </p>
                )
              ))}
            {canEditHours && <BusinessHoursEditor account={a} onSaved={load} />}
          </li>
        ))}
      </ul>
    </main></AppLayout>
  );
}
