'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ContactRound, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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
}

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const stages: { value: LeadStage; label: string }[] = [
  { value: 'cold', label: 'Cold' },
  { value: 'warm', label: 'Warm' },
  { value: 'hot', label: 'Hot' },
  { value: 'very_hot', label: 'Very Hot' },
];

// Lead stages map to the semantic temperature scale.
const stageTone: Record<LeadStage, 'hermes' | 'review' | 'danger'> = {
  cold: 'hermes',
  warm: 'review',
  hot: 'review',
  very_hot: 'danger',
};

const stageLabel: Record<LeadStage, string> = {
  cold: 'Cold',
  warm: 'Warm',
  hot: 'Hot',
  very_hot: 'Very Hot',
};

const inputClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

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
      const query = params.toString();
      const data = await api<Customer[]>(`/customers${query ? `?${query}` : ''}`);
      setCustomers(data);
      setSelectedIds((current) => current.filter((id) => data.some((customer) => customer.id === id)));
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Gagal memuat data pelanggan dari API. Coba muat ulang.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stageFilter, tagFilter]);

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
      setToast('Pilih minimal satu aksi massal sebelum menerapkan.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{ updatedCount: number }>('/customers/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToast(`${result.updatedCount} pelanggan berhasil diperbarui.`);
      setBulkStage('');
      setBulkTags('');
      setAssignedAdminId('');
      setBulkNote('');
      setSelectedIds([]);
      await loadCustomers();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Aksi massal gagal diterapkan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = selectedIds.length;

  return (
    <AppLayout>
      <PageHeader title="Contacts" subtitle="Atur massal stage lead, tag, admin penanggung jawab, dan catatan internal CRM">
        <Badge tone="neutral">{customers.length} pelanggan dimuat</Badge>
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
                aria-label="Cari pelanggan berdasarkan nama atau nomor"
                className={`${inputClass} w-full pl-8`}
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              aria-label="Filter berdasarkan stage lead"
              className={inputClass}
            >
              <option value="">Semua stage</option>
              {stages.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
            <input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Filter tag…"
              aria-label="Filter berdasarkan tag"
              className={inputClass}
            />
            <Button variant="outline" size="md" onClick={loadCustomers}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Muat ulang
            </Button>
          </div>
        </section>

        {/* Bulk action bar */}
        {canBulkEdit && (
          <section className="border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-hermes-600">{selectedCount}</span> pelanggan dipilih
              <span className="ml-2 text-gray-400">Maksimal 100 pelanggan per aksi massal.</span>
            </div>
            <div className="grid gap-2 xl:grid-cols-[150px_1fr_140px_220px_1fr_auto]">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                aria-label="Ubah stage lead untuk pelanggan terpilih"
                className={inputClass}
              >
                <option value="">Ubah stage…</option>
                {stages.map((stage) => (
                  <option key={stage.value} value={stage.value}>{stage.label}</option>
                ))}
              </select>
              <input
                value={bulkTags}
                onChange={(e) => setBulkTags(e.target.value)}
                placeholder="Tag: vip, repeat, promo"
                aria-label="Tag untuk aksi massal, pisahkan dengan koma"
                className={inputClass}
              />
              <select
                value={tagMode}
                onChange={(e) => setTagMode(e.target.value as TagMode)}
                aria-label="Mode penerapan tag"
                className={inputClass}
              >
                <option value="append">Tambah tag</option>
                <option value="replace">Ganti tag</option>
                <option value="remove">Hapus tag</option>
              </select>
              <select
                value={assignedAdminId}
                onChange={(e) => setAssignedAdminId(e.target.value)}
                aria-label="Tetapkan admin penanggung jawab"
                className={inputClass}
              >
                <option value="">Tetapkan admin…</option>
                <option value="unassigned">Tanpa admin</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.name || admin.email}</option>
                ))}
              </select>
              <input
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Catatan internal (opsional)"
                aria-label="Catatan internal untuk aksi massal"
                className={inputClass}
              />
              <Button size="md" onClick={applyBulkAction} disabled={submitting || selectedCount === 0}>
                {submitting ? 'Menerapkan…' : 'Terapkan'}
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
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Belum ada pelanggan cocok</p>
              <p className="mt-1 text-[13px] text-gray-400">
                Longgarkan filter pencarian, atau muat ulang setelah ada chat masuk dari WhatsApp.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadCustomers}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Coba lagi
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
                        aria-label="Pilih semua pelanggan yang tampil"
                        className="accent-hermes-600"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Pelanggan</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Tag</th>
                    <th className="px-4 py-3 font-medium">Admin penanggung jawab</th>
                    <th className="px-4 py-3 font-medium">Kontak terakhir</th>
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
                          aria-label={`Pilih ${customer.name || customer.phoneNumber}`}
                          className="accent-hermes-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{customer.name || 'Tanpa nama'}</div>
                        <div className="text-xs text-gray-400">{customer.phoneNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={stageTone[customer.leadStage]}>{stageLabel[customer.leadStage]}</Badge>
                        <span className="ml-2 text-xs tabular-nums text-gray-400">skor {customer.leadScore}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {customer.tags.length === 0 ? (
                            <span className="text-xs text-gray-400">Tanpa tag</span>
                          ) : (
                            customer.tags.map((tag) => (
                              <Badge key={tag} tone="neutral">{tag}</Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {customer.assignedAdmin?.name || customer.assignedAdmin?.email || (
                          <span className="text-gray-400">Belum ditetapkan</span>
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
        </div>
      </div>
    </AppLayout>
  );
}
