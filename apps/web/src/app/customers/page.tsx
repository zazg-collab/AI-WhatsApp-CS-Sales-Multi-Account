'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ContactRound, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { formatPhone } from '@/lib/contact';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  subtitle: {
    id: 'Atur massal stage lead, tag, admin penanggung jawab, dan catatan internal CRM',
    en: 'Bulk-manage lead stages, tags, the assigned admin, and internal CRM notes',
  },
  hiddenNumber: { id: 'Nomor tersembunyi (privasi WA)', en: 'Hidden number (WA privacy)' },
  loadedCount: { id: '{n} pelanggan dimuat', en: '{n} contacts loaded' },
  loadError: {
    id: 'Gagal memuat data pelanggan dari API. Coba muat ulang.',
    en: 'Failed to load contacts from the API. Try reloading.',
  },
  pickActionFirst: {
    id: 'Pilih minimal satu aksi massal sebelum menerapkan.',
    en: 'Pick at least one bulk action before applying.',
  },
  bulkSuccess: { id: '{n} pelanggan berhasil diperbarui.', en: '{n} contacts updated successfully.' },
  bulkError: {
    id: 'Aksi massal gagal diterapkan. Coba lagi.',
    en: 'The bulk action could not be applied. Try again.',
  },
  searchAria: {
    id: 'Cari pelanggan berdasarkan nama atau nomor',
    en: 'Search contacts by name or number',
  },
  stageFilterAria: { id: 'Filter berdasarkan stage lead', en: 'Filter by lead stage' },
  allStages: { id: 'Semua stage', en: 'All stages' },
  tagFilterPlaceholder: { id: 'Filter tag…', en: 'Filter by tag…' },
  tagFilterAria: { id: 'Filter berdasarkan tag', en: 'Filter by tag' },
  reload: { id: 'Muat ulang', en: 'Reload' },
  selectedCount: { id: 'pelanggan dipilih', en: 'contacts selected' },
  bulkLimit: { id: 'Maksimal 100 pelanggan per aksi massal.', en: 'Up to 100 contacts per bulk action.' },
  changeStageAria: {
    id: 'Ubah stage lead untuk pelanggan terpilih',
    en: 'Change lead stage for the selected contacts',
  },
  changeStage: { id: 'Ubah stage…', en: 'Change stage…' },
  bulkTagsPlaceholder: { id: 'Tag: vip, repeat, promo', en: 'Tags: vip, repeat, promo' },
  bulkTagsAria: {
    id: 'Tag untuk aksi massal, pisahkan dengan koma',
    en: 'Tags for the bulk action, comma-separated',
  },
  tagModeAria: { id: 'Mode penerapan tag', en: 'Tag apply mode' },
  tagAppend: { id: 'Tambah tag', en: 'Add tags' },
  tagReplace: { id: 'Ganti tag', en: 'Replace tags' },
  tagRemove: { id: 'Hapus tag', en: 'Remove tags' },
  assignAdminAria: { id: 'Tetapkan admin penanggung jawab', en: 'Assign the responsible admin' },
  assignAdmin: { id: 'Tetapkan admin…', en: 'Assign admin…' },
  noAdmin: { id: 'Tanpa admin', en: 'No admin' },
  bulkNotePlaceholder: { id: 'Catatan internal (opsional)', en: 'Internal note (optional)' },
  bulkNoteAria: { id: 'Catatan internal untuk aksi massal', en: 'Internal note for the bulk action' },
  applying: { id: 'Menerapkan…', en: 'Applying…' },
  apply: { id: 'Terapkan', en: 'Apply' },
  emptyTitle: { id: 'Belum ada pelanggan cocok', en: 'No matching contacts yet' },
  emptyHint: {
    id: 'Longgarkan filter pencarian, atau muat ulang setelah ada chat masuk dari WhatsApp.',
    en: 'Loosen the search filters, or reload after a chat comes in from WhatsApp.',
  },
  retry: { id: 'Coba lagi', en: 'Try again' },
  selectAllAria: { id: 'Pilih semua pelanggan yang tampil', en: 'Select all visible contacts' },
  colCustomer: { id: 'Pelanggan', en: 'Contact' },
  colStage: { id: 'Stage', en: 'Stage' },
  colTag: { id: 'Tag', en: 'Tag' },
  colAdmin: { id: 'Admin penanggung jawab', en: 'Assigned admin' },
  colLastContact: { id: 'Kontak terakhir', en: 'Last contact' },
  selectRow: { id: 'Pilih {name}', en: 'Select {name}' },
  noName: { id: 'Tanpa nama', en: 'No name' },
  score: { id: 'skor {n}', en: 'score {n}' },
  noTag: { id: 'Tanpa tag', en: 'No tag' },
  unassigned: { id: 'Belum ditetapkan', en: 'Unassigned' },
  stageCold: { id: 'Cold', en: 'Cold' },
  stageWarm: { id: 'Warm', en: 'Warm' },
  stageHot: { id: 'Hot', en: 'Hot' },
  stageVeryHot: { id: 'Very Hot', en: 'Very Hot' },
};

type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type TagMode = 'append' | 'replace' | 'remove';

interface Customer {
  id: string;
  name?: string | null;
  phoneNumber: string;
  leadScore: number;
  leadStage: LeadStage;
  tags: string[];
  notes?: string | null;
  lastMessageAt?: string | null;
  assignedAdminId?: string | null;
  assignedAdmin?: { id: string; name: string; email?: string } | null;
  avatarUrl?: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const stages: { value: LeadStage; labelKey: string }[] = [
  { value: 'cold', labelKey: 'stageCold' },
  { value: 'warm', labelKey: 'stageWarm' },
  { value: 'hot', labelKey: 'stageHot' },
  { value: 'very_hot', labelKey: 'stageVeryHot' },
];

// Lead stages map to the semantic temperature scale.
const stageTone: Record<LeadStage, 'hermes' | 'review' | 'danger'> = {
  cold: 'hermes',
  warm: 'review',
  hot: 'review',
  very_hot: 'danger',
};

const stageLabelKey: Record<LeadStage, string> = {
  cold: 'stageCold',
  warm: 'stageWarm',
  hot: 'stageHot',
  very_hot: 'stageVeryHot',
};

const inputClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function getRoleFromToken(): Role | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function splitTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

export default function CustomersPage() {
  const t = useT(dict);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [bulkStage, setBulkStage] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [tagMode, setTagMode] = useState<TagMode>('append');
  const [assignedAdminId, setAssignedAdminId] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const canBulkEdit = role === 'owner' || role === 'supervisor' || role === 'admin';
  const canLoadAdmins = role === 'owner' || role === 'supervisor';

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = customers.length > 0 && customers.every((customer) => selectedSet.has(customer.id));

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (stageFilter) params.set('stage', stageFilter);
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      const data = await api<{ items: Customer[]; total: number }>(`/customers?${params.toString()}`);
      const items = data.items ?? [];
      setCustomers(items);
      setTotal(data.total ?? items.length);
      setSelectedIds((current) => current.filter((id) => items.some((customer) => customer.id === id)));
    } catch (err) {
      setToast(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, stageFilter, tagFilter, t]);

  useEffect(() => {
    setRole(getRoleFromToken());
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!canLoadAdmins) return;
    api<{ users: User[] }>('/users?limit=100')
      .then((data) => setAdmins(data.users.filter((user) => user.role !== 'viewer')))
      .catch(() => setAdmins([]));
  }, [canLoadAdmins]);

  function toggleCustomer(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id],
    );
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !customers.some((customer) => customer.id === id));
      return [...new Set([...current, ...customers.map((customer) => customer.id)])];
    });
  }

  async function applyBulkAction() {
    if (selectedIds.length === 0 || !canBulkEdit) return;
    const payload: Record<string, unknown> = { customerIds: selectedIds };
    if (bulkStage) payload.leadStage = bulkStage;
    if (bulkTags.trim()) {
      payload.tags = splitTags(bulkTags);
      payload.tagMode = tagMode;
    }
    if (assignedAdminId) payload.assignedAdminId = assignedAdminId === 'unassigned' ? null : assignedAdminId;
    if (bulkNote.trim()) payload.note = bulkNote.trim();

    if (Object.keys(payload).length === 1) {
      setToast(t('pickActionFirst'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{ updatedCount: number }>('/customers/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToast(t('bulkSuccess', { n: result.updatedCount }));
      setBulkStage('');
      setBulkTags('');
      setAssignedAdminId('');
      setBulkNote('');
      setSelectedIds([]);
      await loadCustomers();
    } catch (err) {
      setToast(err instanceof Error ? err.message : t('bulkError'));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = selectedIds.length;

  return (
    <AppLayout>
      <PageHeader title="Contacts" subtitle={t('subtitle')}>
        <Badge tone="neutral">{t('loadedCount', { n: customers.length })}</Badge>
      </PageHeader>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Filters */}
        <section className="border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-2 lg:grid-cols-[1fr_180px_180px_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or number…"
                aria-label={t('searchAria')}
                className={`${inputClass} w-full pl-8`}
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              aria-label={t('stageFilterAria')}
              className={inputClass}
            >
              <option value="">{t('allStages')}</option>
              {stages.map((stage) => (
                <option key={stage.value} value={stage.value}>{t(stage.labelKey)}</option>
              ))}
            </select>
            <input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder={t('tagFilterPlaceholder')}
              aria-label={t('tagFilterAria')}
              className={inputClass}
            />
            <Button variant="outline" size="md" onClick={loadCustomers}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {t('reload')}
            </Button>
          </div>
        </section>

        {/* Bulk action bar */}
        {canBulkEdit && (
          <section className="border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-hermes-600">{selectedCount}</span> {t('selectedCount')}
              <span className="ml-2 text-gray-400">{t('bulkLimit')}</span>
            </div>
            <div className="grid gap-2 xl:grid-cols-[150px_1fr_140px_220px_1fr_auto]">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                aria-label={t('changeStageAria')}
                className={inputClass}
              >
                <option value="">{t('changeStage')}</option>
                {stages.map((stage) => (
                  <option key={stage.value} value={stage.value}>{t(stage.labelKey)}</option>
                ))}
              </select>
              <input
                value={bulkTags}
                onChange={(e) => setBulkTags(e.target.value)}
                placeholder={t('bulkTagsPlaceholder')}
                aria-label={t('bulkTagsAria')}
                className={inputClass}
              />
              <select
                value={tagMode}
                onChange={(e) => setTagMode(e.target.value as TagMode)}
                aria-label={t('tagModeAria')}
                className={inputClass}
              >
                <option value="append">{t('tagAppend')}</option>
                <option value="replace">{t('tagReplace')}</option>
                <option value="remove">{t('tagRemove')}</option>
              </select>
              <select
                value={assignedAdminId}
                onChange={(e) => setAssignedAdminId(e.target.value)}
                aria-label={t('assignAdminAria')}
                className={inputClass}
              >
                <option value="">{t('assignAdmin')}</option>
                <option value="unassigned">{t('noAdmin')}</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.name || admin.email}</option>
                ))}
              </select>
              <input
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder={t('bulkNotePlaceholder')}
                aria-label={t('bulkNoteAria')}
                className={inputClass}
              />
              <Button size="md" onClick={applyBulkAction} disabled={submitting || selectedCount === 0}>
                {submitting ? t('applying') : t('apply')}
              </Button>
            </div>
          </section>
        )}

        {toast && (
          <button
            onClick={() => setToast(null)}
            className="mx-5 mt-3 flex items-center gap-2 self-start rounded-lg border border-hermes-100 bg-hermes-50 px-3 py-2 text-left text-sm text-hermes-700 dark:border-hermes-800 dark:bg-hermes-900/30 dark:text-hermes-200"
          >
            {toast}
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}

        <div className="scrollbar-thin flex-1 overflow-auto p-5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-14 rounded-lg animate-shimmer" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <ContactRound className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('emptyTitle')}</p>
              <p className="mt-1 text-[13px] text-gray-400">
                {t('emptyHint')}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadCustomers}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {t('retry')}
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label={t('selectAllAria')}
                        className="accent-hermes-600"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">{t('colCustomer')}</th>
                    <th className="px-4 py-3 font-medium">{t('colStage')}</th>
                    <th className="px-4 py-3 font-medium">{t('colTag')}</th>
                    <th className="px-4 py-3 font-medium">{t('colAdmin')}</th>
                    <th className="px-4 py-3 font-medium">{t('colLastContact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(customer.id)}
                          onChange={() => toggleCustomer(customer.id)}
                          aria-label={t('selectRow', { name: customer.name || customer.phoneNumber })}
                          className="accent-hermes-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={customer.name} phone={customer.phoneNumber} avatarUrl={customer.avatarUrl} className="h-8 w-8 text-[11px] font-semibold" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900 dark:text-gray-100">{customer.name || t('noName')}</div>
                            <div className="text-xs text-gray-400">{formatPhone(customer.phoneNumber, t('hiddenNumber'))}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={stageTone[customer.leadStage]}>{t(stageLabelKey[customer.leadStage])}</Badge>
                        <span className="ml-2 text-xs tabular-nums text-gray-400">{t('score', { n: customer.leadScore })}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {customer.tags.length === 0 ? (
                            <span className="text-xs text-gray-400">{t('noTag')}</span>
                          ) : (
                            customer.tags.map((tag) => (
                              <Badge key={tag} tone="neutral">{tag}</Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {customer.assignedAdmin?.name || customer.assignedAdmin?.email || (
                          <span className="text-gray-400">{t('unassigned')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {customer.lastMessageAt ? new Date(customer.lastMessageAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="tabular-nums">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page * pageSize >= total || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
