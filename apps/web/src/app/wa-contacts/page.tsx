'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, MagnifyingGlass, DeviceMobile } from '@phosphor-icons/react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPhone, isLid } from '@/lib/contact';
import { useT, type Dict } from '@/lib/i18n';

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

const dict: Dict = {
  title: { id: 'WhatsApp Contact Book', en: 'WhatsApp Contact Book' },
  subtitle: { id: 'Kontak asli dari history sync dan contacts update Baileys', en: 'Original contacts from Baileys history sync and contact updates' },
  reload: { id: 'Muat ulang', en: 'Reload' },
  selectAccount: { id: 'Pilih akun WhatsApp', en: 'Select WhatsApp account' },
  contactsSynced: { id: 'kontak tersync', en: 'contacts synced' },
  searchPlaceholder: { id: 'Cari nama, nomor, atau JID', en: 'Search name, number, or JID' },
  searchAria: { id: 'Cari kontak WhatsApp', en: 'Search WhatsApp contacts' },
  colContact: { id: 'Kontak', en: 'Contact' },
  colPhoneJid: { id: 'Nomor/JID', en: 'Number/JID' },
  colCrm: { id: 'CRM', en: 'CRM' },
  colBio: { id: 'Bio', en: 'Bio' },
  colSync: { id: 'Sync', en: 'Sync' },
  loading: { id: 'Memuat...', en: 'Loading...' },
  showing: { id: 'ditampilkan', en: 'shown' },
  noContacts: { id: 'Belum ada kontak tersync untuk akun ini.', en: 'No contacts synced for this account yet.' },
  noAccounts: { id: 'Tidak ada akun WhatsApp terhubung', en: 'No WhatsApp accounts connected' },
  noAccountsHint: { id: 'Tambahkan akun untuk mensync kontak.', en: 'Add an account to sync contacts.' },
  addAccount: { id: 'Tambah akun', en: 'Add account' },
  notLinked: { id: 'Belum terkait customer', en: 'Not linked to CRM' },
  noCrmName: { id: 'crm', en: 'crm' },
};

function displayName(contact: WhatsappContact) {
  return contact.name ?? contact.verifiedName ?? contact.notify ?? contact.customer?.name ?? 'Tanpa nama';
}

export default function WhatsappContactsPage() {
  const t = useT(dict);
  const [accounts, setAccounts] = useState<WhatsappAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<ContactResponse>({ items: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );

  const loadAccounts = useCallback(async () => {
    const rows = await api<WhatsappAccount[]>('/wa/accounts');
    setAccounts(rows);
    setAccountId((current) => current || rows[0]?.id || '');
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const loadContacts = useCallback(async () => {
    if (!accountId) {
      setData({ items: [], total: 0, page: 1, limit: 50 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', page: String(page) });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const result = await api<ContactResponse>(`/wa/accounts/${accountId}/contacts?${params.toString()}`);
      setData(result);
    } catch {
      setError(t('searchPlaceholder'));
    } finally {
      setLoading(false);
    }
  }, [accountId, debouncedSearch, page, t]);

  useEffect(() => {
    loadAccounts().catch(() => {
      setError(t('title'));
      setLoading(false);
    });
  }, [loadAccounts, t]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, accountId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
        >
          <Button variant="outline" size="sm" onClick={loadContacts} disabled={loading || !accountId}>
            <ArrowsClockwise className="h-4 w-4" />
            {t('reload')}
          </Button>
        </PageHeader>

        <main className="flex-1 overflow-auto p-5">
          {accounts.length === 0 && !loading ? (
            <EmptyState
              icon={DeviceMobile}
              title={t('noAccounts')}
              hint={t('noAccountsHint')}
              action={{ label: t('addAccount'), href: '/accounts' }}
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={inputClass}
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    aria-label={t('selectAccount')}
                  >
                    <option value="">{t('selectAccount')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountName} {account.phoneNumber ? `(${account.phoneNumber})` : ''}
                      </option>
                    ))}
                  </select>
                  <Badge tone="neutral">{data.total} {t('contactsSynced')}</Badge>
                </div>
                <label className="relative block w-full max-w-md">
                  <MagnifyingGlass className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    className={`${inputClass} w-full pl-9`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchAria')}
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
                  <CardTitle>{selectedAccount?.accountName ?? t('title')}</CardTitle>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {loading ? t('loading') : `${data.items.length} ${t('showing')}`}
                  </span>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3">{t('colContact')}</th>
                        <th className="px-4 py-3">{t('colPhoneJid')}</th>
                        <th className="px-4 py-3">{t('colCrm')}</th>
                        <th className="px-4 py-3">{t('colBio')}</th>
                        <th className="px-4 py-3">{t('colSync')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={`skeleton-${i}`}>
                            <td className="px-4 py-3"><div className="h-8 rounded animate-shimmer" /></td>
                            <td className="px-4 py-3"><div className="h-8 rounded animate-shimmer" /></td>
                            <td className="px-4 py-3"><div className="h-8 rounded animate-shimmer" /></td>
                            <td className="px-4 py-3"><div className="h-8 rounded animate-shimmer" /></td>
                            <td className="px-4 py-3"><div className="h-8 rounded animate-shimmer" /></td>
                          </tr>
                        ))
                      ) : data.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                            {t('noContacts')}
                          </td>
                        </tr>
                      ) : (
                        data.items.map((contact) => (
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
                                  <Badge tone="hermes">{contact.customer.leadStage ?? t('noCrmName')}</Badge>
                                  {contact.customer.tags.slice(0, 2).map((tag) => (
                                    <Badge key={tag} tone="neutral">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">{t('notLinked')}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                              {contact.status ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {new Date(contact.lastSyncedAt).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {data.total > data.limit && (
                  <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <span className="tabular-nums">
                      {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} {t('colContact').toLowerCase()} {data.total} {t('contactsSynced').toLowerCase()}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page * data.limit >= data.total || loading} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
