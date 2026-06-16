'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPhone, isLid } from '@/lib/contact';

interface WhatsappAccount {
  id: string;
  accountName: string;
  phoneNumber?: string | null;
}

interface WhatsappContact {
  id: string;
  jid: string;
  phoneNumber?: string | null;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
  lastSyncedAt: string;
  whatsappAccount: WhatsappAccount;
  customer?: {
    id: string;
    name?: string | null;
    leadStage?: string | null;
    tags: string[];
  } | null;
}

interface ContactResponse {
  items: WhatsappContact[];
  total: number;
  page: number;
  limit: number;
}

const inputClass =
  'h-9 rounded border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function displayName(contact: WhatsappContact) {
  return contact.name ?? contact.verifiedName ?? contact.notify ?? contact.customer?.name ?? 'Tanpa nama';
}

export default function WhatsappContactsPage() {
  const [accounts, setAccounts] = useState<WhatsappAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ContactResponse>({ items: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );

  const loadAccounts = useCallback(async () => {
    const rows = await api<WhatsappAccount[]>('/wa/accounts');
    setAccounts(rows);
    setAccountId((current) => current || rows[0]?.id || '');
  }, []);

  const loadContacts = useCallback(async () => {
    if (!accountId) {
      setData({ items: [], total: 0, page: 1, limit: 50 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search.trim()) params.set('search', search.trim());
      const result = await api<ContactResponse>(`/wa/accounts/${accountId}/contacts?${params.toString()}`);
      setData(result);
    } catch {
      setError('Gagal memuat buku kontak WhatsApp. Coba muat ulang.');
    } finally {
      setLoading(false);
    }
  }, [accountId, search]);

  useEffect(() => {
    loadAccounts().catch(() => {
      setError('Gagal memuat akun WhatsApp.');
      setLoading(false);
    });
  }, [loadAccounts]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
        <PageHeader
          title="WhatsApp Contact Book"
          subtitle="Kontak asli dari history sync dan contacts update Baileys"
        >
          <Button variant="outline" size="sm" onClick={loadContacts} disabled={loading || !accountId}>
            <RefreshCw className="h-4 w-4" />
            Muat ulang
          </Button>
        </PageHeader>

        <main className="flex-1 overflow-auto p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={inputClass}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                aria-label="Pilih akun WhatsApp"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName} {account.phoneNumber ? `(${account.phoneNumber})` : ''}
                  </option>
                ))}
              </select>
              <Badge tone="neutral">{data.total} kontak tersync</Badge>
            </div>
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                className={`${inputClass} w-full pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, nomor, atau JID"
                aria-label="Cari kontak WhatsApp"
              />
            </label>
          </div>

          {error && (
            <div className="mb-4 rounded border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-900/60 dark:bg-danger-950/40 dark:text-danger-200">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{selectedAccount?.accountName ?? 'Kontak WhatsApp'}</CardTitle>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {loading ? 'Memuat...' : `${data.items.length} ditampilkan`}
              </span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Kontak</th>
                    <th className="px-4 py-3">Nomor/JID</th>
                    <th className="px-4 py-3">CRM</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                  {data.items.map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={displayName(contact)} phone={contact.phoneNumber ?? contact.jid} avatarUrl={contact.avatarUrl} className="h-9 w-9 text-[12px] font-semibold" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-950 dark:text-gray-50">
                              {displayName(contact)}
                            </div>
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {contact.verifiedName || contact.notify || 'Nama WhatsApp belum tersedia'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-gray-700 dark:text-gray-200">
                          {contact.phoneNumber && !isLid(contact.phoneNumber)
                            ? contact.phoneNumber
                            : <span className="font-sans text-gray-400">{formatPhone(contact.phoneNumber, 'Nomor tersembunyi (privasi WA)')}</span>}
                        </div>
                        <div className="mt-1 max-w-[260px] truncate font-mono text-[11px] text-gray-400">
                          {contact.jid}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {contact.customer ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="hermes">{contact.customer.leadStage ?? 'crm'}</Badge>
                            {contact.customer.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} tone="neutral">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Belum terkait customer</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {contact.status ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(contact.lastSyncedAt).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                  {!loading && data.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        Belum ada kontak tersync untuk akun ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </main>
      </div>
    </AppLayout>
  );
}
