'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

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

const stageColors: Record<LeadStage, string> = {
  cold: 'bg-blue-900/50 text-blue-200',
  warm: 'bg-yellow-900/50 text-yellow-200',
  hot: 'bg-orange-900/50 text-orange-200',
  very_hot: 'bg-red-900/50 text-red-200',
};

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
  // M7: debounced copy of `search` so typing doesn't fire a request per keystroke.
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
      setToast(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stageFilter, tagFilter]);

  useEffect(() => {
    const currentRole = getRoleFromToken();
    setRole(currentRole);
  }, []);

  // M7: debounce search input — only query 300ms after the user stops typing.
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
      setToast('Pilih minimal satu bulk action.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{ updatedCount: number }>('/customers/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToast(`${result.updatedCount} customer berhasil diupdate.`);
      setBulkStage('');
      setBulkTags('');
      setAssignedAdminId('');
      setBulkNote('');
      setSelectedIds([]);
      await loadCustomers();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = selectedIds.length;

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Customers</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Bulk assign stage, tags, admin, dan internal note.</p>
            </div>
            <div className="rounded border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              {customers.length} customers loaded
            </div>
          </div>
        </header>

        <section className="border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 px-6 py-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama / nomor..."
              className="rounded bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
            />
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="rounded bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none"
            >
              <option value="">Semua stage</option>
              {stages.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Filter tag"
              className="rounded bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
            />
            <button
              onClick={loadCustomers}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Refresh
            </button>
          </div>
        </section>

        {canBulkEdit && (
          <section className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
            <div className="mb-3 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold text-emerald-300">{selectedCount}</span> customer dipilih
              <span className="ml-2 text-xs text-gray-500">Maksimal 100 customer per bulk action.</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-[150px_1fr_140px_220px_1fr_auto]">
              <select
                value={bulkStage}
                onChange={(event) => setBulkStage(event.target.value)}
                className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              >
                <option value="">Stage...</option>
                {stages.map((stage) => (
                  <option key={stage.value} value={stage.value}>{stage.label}</option>
                ))}
              </select>
              <input
                value={bulkTags}
                onChange={(event) => setBulkTags(event.target.value)}
                placeholder="Tags: vip, repeat, promo"
                className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
              />
              <select
                value={tagMode}
                onChange={(event) => setTagMode(event.target.value as TagMode)}
                className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              >
                <option value="append">Tambah tag</option>
                <option value="replace">Replace tag</option>
                <option value="remove">Hapus tag</option>
              </select>
              <select
                value={assignedAdminId}
                onChange={(event) => setAssignedAdminId(event.target.value)}
                className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              >
                <option value="">Assign admin...</option>
                <option value="unassigned">Unassigned</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.name || admin.email}</option>
                ))}
              </select>
              <input
                value={bulkNote}
                onChange={(event) => setBulkNote(event.target.value)}
                placeholder="Internal note opsional"
                className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
              />
              <button
                onClick={applyBulkAction}
                disabled={submitting || selectedCount === 0}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </section>
        )}

        {toast && (
          <button
            onClick={() => setToast(null)}
            className="mx-6 mt-4 rounded border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-left text-sm text-emerald-200"
          >
            {toast}
          </button>
        )}

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading customers...</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Belum ada customer.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="w-10 px-4 py-3 text-left">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                    </th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Stage</th>
                    <th className="px-4 py-3 text-left">Tags</th>
                    <th className="px-4 py-3 text-left">Assigned Admin</th>
                    <th className="px-4 py-3 text-left">Last Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-100/50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(customer.id)}
                          onChange={() => toggleCustomer(customer.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{customer.name || 'Tanpa nama'}</div>
                        <div className="text-xs text-gray-500">{customer.phoneNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-xs font-medium ${stageColors[customer.leadStage]}`}>
                          {customer.leadStage}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">score {customer.leadScore}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {customer.tags.length === 0 ? (
                            <span className="text-xs text-gray-500">No tags</span>
                          ) : customer.tags.map((tag) => (
                            <span key={tag} className="rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-800 dark:text-gray-200">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {customer.assignedAdmin?.name || customer.assignedAdmin?.email || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {customer.lastMessageAt ? new Date(customer.lastMessageAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
