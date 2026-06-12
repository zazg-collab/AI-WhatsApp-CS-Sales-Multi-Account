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

interface AccountHealth {
  accountId: string;
  dbStatus: string;
  liveSocket: boolean;
  reconnectAttempts: number;
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
        {open ? '▾' : '▸'} Jam operasional &amp; auto-away
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

function WhatsAppProfileEditor({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [picFile, setPicFile] = useState<File | null>(null);
  const [picSaving, setPicSaving] = useState(false);
  const [picSaved, setPicSaved] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [statusImageUrl, setStatusImageUrl] = useState('');
  const [statusCaption, setStatusCaption] = useState('');
  const [postingStatus, setPostingStatus] = useState(false);
  const [statusPosted, setStatusPosted] = useState(false);

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    try {
      await api(`/wa/accounts/${account.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(profileName.trim() ? { name: profileName.trim() } : {}),
          ...(status.trim() ? { status: status.trim() } : {}),
        }),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPicture() {
    if (!picFile) return;
    setPicSaving(true);
    setPicSaved(false);
    try {
      const form = new FormData();
      form.append('file', picFile);
      await api(`/wa/accounts/${account.id}/profile/picture`, {
        method: 'PATCH',
        body: form,
        headers: {},
      });
      setPicSaved(true);
      setPicFile(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal upload foto');
    } finally {
      setPicSaving(false);
    }
  }

  async function postStatus() {
    if (!statusText.trim() && !statusImageUrl.trim()) return;
    setPostingStatus(true);
    setStatusPosted(false);
    try {
      await api(`/wa/accounts/${account.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          text: statusText.trim() || undefined,
          imageUrl: statusImageUrl.trim() || undefined,
          caption: statusCaption.trim() || undefined,
        }),
      });
      setStatusPosted(true);
      setStatusText('');
      setStatusImageUrl('');
      setStatusCaption('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal post status');
    } finally {
      setPostingStatus(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-black/30 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-wa-accent hover:underline"
      >
        {open ? '▾' : '▸'} Profil WhatsApp &amp; Status
      </button>
      {open && (
        <div className="mt-3 space-y-4 text-sm">
          {/* Profile name & about */}
          <div className="rounded bg-black/5 dark:bg-black/20 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nama &amp; About</p>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Nama tampilan WhatsApp"
              className="w-full rounded bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Status / About (mis. Buka 09:00–17:00)"
              className="w-full rounded bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveProfile}
                disabled={saving || (!profileName.trim() && !status.trim())}
                className="rounded bg-wa-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              {saved && <span className="text-xs text-emerald-400">Tersimpan ✓</span>}
            </div>
          </div>

          {/* Profile picture */}
          <div className="rounded bg-black/5 dark:bg-black/20 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Foto Profil</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPicFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600 dark:text-gray-400"
            />
            {picFile && (
              <p className="text-xs text-gray-500">File dipilih: {picFile.name}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={uploadPicture}
                disabled={picSaving || !picFile}
                className="rounded bg-wa-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
              >
                {picSaving ? 'Mengupload...' : 'Upload Foto'}
              </button>
              {picSaved && <span className="text-xs text-emerald-400">Foto diperbarui ✓</span>}
            </div>
          </div>

          {/* Post WhatsApp status/story */}
          <div className="rounded bg-black/5 dark:bg-black/20 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Post Status / Story</p>
            <textarea
              rows={2}
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="Teks status (mis. Promo hari ini 50%!)"
              className="w-full resize-none rounded bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
            <input
              value={statusImageUrl}
              onChange={(e) => setStatusImageUrl(e.target.value)}
              placeholder="URL gambar (opsional)"
              className="w-full rounded bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
            {statusImageUrl.trim() && (
              <input
                value={statusCaption}
                onChange={(e) => setStatusCaption(e.target.value)}
                placeholder="Caption gambar (opsional)"
                className="w-full rounded bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={postStatus}
                disabled={postingStatus || (!statusText.trim() && !statusImageUrl.trim())}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 hover:bg-blue-700"
              >
                {postingStatus ? 'Memposting...' : 'Post Status'}
              </button>
              {statusPosted && <span className="text-xs text-emerald-400">Status diposting ✓</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountHealthPanel({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadHealth() {
    setLoading(true);
    try {
      const data = await api<AccountHealth>(`/wa/accounts/${accountId}/health`);
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadHealth();
    const interval = setInterval(loadHealth, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-black/30 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-wa-accent hover:underline"
      >
        {open ? '▾' : '▸'} Health Detail
      </button>
      {open && (
        <div className="mt-2 text-sm">
          {loading && !health && <p className="text-xs text-gray-500">Memuat...</p>}
          {health && (
            <div className="grid grid-cols-3 gap-2 text-xs mt-1">
              <div className="rounded bg-black/5 dark:bg-black/20 p-2 text-center">
                <div className={`font-semibold ${health.liveSocket ? 'text-emerald-400' : 'text-red-400'}`}>
                  {health.liveSocket ? '● Live' : '○ Offline'}
                </div>
                <div className="text-gray-500 mt-0.5">Live Socket</div>
              </div>
              <div className="rounded bg-black/5 dark:bg-black/20 p-2 text-center">
                <div className={`font-semibold ${health.dbStatus === 'connected' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {health.dbStatus}
                </div>
                <div className="text-gray-500 mt-0.5">DB Status</div>
              </div>
              <div className="rounded bg-black/5 dark:bg-black/20 p-2 text-center">
                <div className={`font-semibold ${health.reconnectAttempts === 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {health.reconnectAttempts}
                </div>
                <div className="text-gray-500 mt-0.5">Reconnect</div>
              </div>
            </div>
          )}
          <button onClick={loadHealth} disabled={loading} className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50">
            {loading ? 'Memuat...' : '↻ Refresh'}
          </button>
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
  const [restarting, setRestarting] = useState<Record<string, boolean>>({});
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

  async function restartAccount(accountId: string) {
    setRestarting((prev) => ({ ...prev, [accountId]: true }));
    try {
      await api(`/wa/accounts/${accountId}/restart`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal restart');
    } finally {
      setRestarting((prev) => ({ ...prev, [accountId]: false }));
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
                <span className={`rounded px-2 py-1 text-xs ${
                  a.sessionStatus === 'connected'
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : a.sessionStatus === 'reconnecting'
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : a.sessionStatus === 'qr_required'
                    ? 'bg-blue-900/30 text-blue-400'
                    : 'bg-black/10 dark:bg-black/40 text-gray-500'
                }`}>
                  {a.sessionStatus}
                </span>
                {canScan && (
                  <button
                    onClick={() => restartAccount(a.id)}
                    disabled={restarting[a.id]}
                    title="Restart sesi WhatsApp"
                    className="rounded px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors disabled:opacity-50"
                  >
                    {restarting[a.id] ? '⏳' : '↺ Restart'}
                  </button>
                )}
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
            {canScan && <WhatsAppProfileEditor account={a} onSaved={load} />}
            <AccountHealthPanel accountId={a.id} />
          </li>
        ))}
      </ul>
    </main></AppLayout>
  );
}
