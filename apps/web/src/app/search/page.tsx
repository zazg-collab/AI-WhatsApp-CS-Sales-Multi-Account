'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

interface SearchResult {
  id: string;
  content: string;
  senderType: string;
  createdAt: string;
  conversation: {
    id: string;
    whatsappAccount: { accountName: string };
  };
  customer?: { name: string | null; phoneNumber: string } | null;
}

interface ValidateResult {
  phoneNumber: string;
  exists: boolean;
}

interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
}

export default function SearchPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Cross-account search
  const [query, setQuery] = useState('');
  const [searchAccountId, setSearchAccountId] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // Validate number
  const [validateAccount, setValidateAccount] = useState('');
  const [validatePhone, setValidatePhone] = useState('');
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [validating, setValidating] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (accountsLoaded) return;
    try {
      const data = await api<Account[]>('/wa/accounts');
      setAccounts(data);
      if (data.length > 0) {
        setSearchAccountId(data[0].id);
        setValidateAccount(data[0].id);
      }
      setAccountsLoaded(true);
    } catch { /* ignore */ }
  }, [accountsLoaded]);

  useState(() => { loadAccounts(); });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !searchAccountId) return;
    setSearching(true);
    setSearchDone(false);
    try {
      const data = await api<SearchResult[]>(
        `/wa/accounts/${searchAccountId}/messages/search?q=${encodeURIComponent(query.trim())}&limit=50`,
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  }

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePhone.trim() || !validateAccount) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const data = await api<ValidateResult>('/conversations/validate-number', {
        method: 'POST',
        body: JSON.stringify({ accountId: validateAccount, phoneNumber: validatePhone.trim() }),
      });
      setValidateResult(data);
    } catch {
      setValidateResult({ phoneNumber: validatePhone.trim(), exists: false });
    } finally {
      setValidating(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <AppLayout>
      <main className="mx-auto max-w-3xl p-8 space-y-10">
        <h1 className="text-xl font-semibold text-wa-accent">Pencarian & Validasi</h1>

        {/* Cross-account message search */}
        <section>
          <h2 className="text-base font-medium mb-4">🔍 Cari Pesan</h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <select
                value={searchAccountId}
                onChange={(e) => setSearchAccountId(e.target.value)}
                className="rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none border border-gray-200 dark:border-gray-700"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountName} ({a.phoneNumber})</option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kata kunci pesan..."
                className="flex-1 rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none border border-gray-200 dark:border-gray-700"
              />
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                {searching ? 'Mencari...' : 'Cari'}
              </button>
            </div>
          </form>

          {searchDone && results.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">Tidak ada hasil untuk &quot;{query}&quot;</p>
          )}

          {results.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500">{results.length} hasil ditemukan</p>
              {results.map((r) => (
                <div key={r.id} className="rounded-lg bg-white dark:bg-wa-panel p-3 border border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{r.content}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                        <span>👤 {r.customer?.name ?? r.customer?.phoneNumber ?? '—'}</span>
                        <span>📱 {r.conversation.whatsappAccount.accountName}</span>
                        <span className={`px-1.5 py-0.5 rounded ${r.senderType === 'customer' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                          {r.senderType}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{formatTime(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Validate WhatsApp number */}
        <section>
          <h2 className="text-base font-medium mb-4">✅ Validasi Nomor WhatsApp</h2>
          <form onSubmit={handleValidate} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <select
                value={validateAccount}
                onChange={(e) => setValidateAccount(e.target.value)}
                className="rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none border border-gray-200 dark:border-gray-700"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountName}</option>
                ))}
              </select>
              <input
                value={validatePhone}
                onChange={(e) => setValidatePhone(e.target.value)}
                placeholder="Nomor (mis. 628123456789)"
                className="flex-1 rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none border border-gray-200 dark:border-gray-700"
              />
              <button
                type="submit"
                disabled={validating || !validatePhone.trim()}
                className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                {validating ? 'Memeriksa...' : 'Cek'}
              </button>
            </div>
          </form>

          {validateResult && (
            <div className={`mt-4 rounded-lg p-4 flex items-center gap-3 ${validateResult.exists ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-red-900/20 border border-red-800/40'}`}>
              <span className="text-2xl">{validateResult.exists ? '✅' : '❌'}</span>
              <div>
                <p className="font-medium text-sm">
                  {validateResult.exists ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak ditemukan di WhatsApp'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{validateResult.phoneNumber}</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppLayout>
  );
}
