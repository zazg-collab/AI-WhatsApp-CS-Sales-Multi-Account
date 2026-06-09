'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qr, setQr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-xl font-semibold text-wa-accent">
        Nomor WhatsApp
      </h1>

      <form onSubmit={addAccount} className="mb-8 flex gap-2">
        <input
          placeholder="Nama akun"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded bg-wa-panel px-3 py-2 outline-none"
          required
        />
        <input
          placeholder="Nomor (mis. 628123...)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 rounded bg-wa-panel px-3 py-2 outline-none"
          required
        />
        <button className="rounded bg-wa-accent px-4 font-medium text-black">
          Tambah
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <ul className="space-y-4">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-lg bg-wa-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{a.accountName}</p>
                <p className="text-xs text-gray-400">{a.phoneNumber}</p>
              </div>
              <span className="rounded bg-black/40 px-2 py-1 text-xs">
                {a.sessionStatus}
              </span>
            </div>
            {qr[a.id] && a.sessionStatus === 'qr_required' && (
              <img
                src={qr[a.id]}
                alt="QR"
                className="mt-4 h-48 w-48 rounded bg-white p-2"
              />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
