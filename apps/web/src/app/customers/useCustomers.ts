'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './customers.i18n';

type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
export type TagMode = 'append' | 'replace' | 'remove';

export interface Customer {
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

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const stages: { value: LeadStage; labelKey: string }[] = [
  { value: 'cold', labelKey: 'stageCold' },
  { value: 'warm', labelKey: 'stageWarm' },
  { value: 'hot', labelKey: 'stageHot' },
  { value: 'very_hot', labelKey: 'stageVeryHot' },
];

export const stageTone: Record<LeadStage, 'hermes' | 'review' | 'danger' | 'neutral'> = {
  cold: 'neutral', warm: 'review', hot: 'review', very_hot: 'danger',
};

export const stageLabelKey: Record<LeadStage, string> = {
  cold: 'stageCold', warm: 'stageWarm', hot: 'stageHot', very_hot: 'stageVeryHot',
};

function getRoleFromToken(): Role | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])).role ?? null; }
  catch { return null; }
}

function splitTags(value: string) {
  return [...new Set(value.split(',').map((t) => t.trim()).filter(Boolean))];
}

export const PAGE_SIZE = 50;

export function useCustomers() {
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
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const canBulkEdit = role === 'owner' || role === 'supervisor' || role === 'admin';
  const canLoadAdmins = role === 'owner' || role === 'supervisor';

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = customers.length > 0 && customers.every((c) => selectedSet.has(c.id));

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (stageFilter) params.set('stage', stageFilter);
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const data = await api<{ items: Customer[]; total: number }>(`/customers?${params.toString()}`);
      const items = data.items ?? [];
      setCustomers(items);
      setTotal(data.total ?? items.length);
      setSelectedIds((curr) => curr.filter((id) => items.some((c) => c.id === id)));
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : t('loadError'), tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, stageFilter, tagFilter, t]);

  useEffect(() => { setRole(getRoleFromToken()); }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, stageFilter, tagFilter]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  useEffect(() => {
    if (!canLoadAdmins) return;
    api<{ users: User[] }>('/users?limit=100')
      .then((data) => setAdmins(data.users.filter((u) => u.role !== 'viewer')))
      .catch(() => setAdmins([]));
  }, [canLoadAdmins]);

  function toggleCustomer(id: string) {
    setSelectedIds((curr) => curr.includes(id) ? curr.filter((s) => s !== id) : [...curr, id]);
  }

  function toggleAllVisible() {
    setSelectedIds((curr) => {
      if (allVisibleSelected) return curr.filter((id) => !customers.some((c) => c.id === id));
      return [...new Set([...curr, ...customers.map((c) => c.id)])];
    });
  }

  async function applyBulkAction() {
    if (selectedIds.length === 0 || !canBulkEdit) return;
    const payload: Record<string, unknown> = { customerIds: selectedIds };
    if (bulkStage) payload.leadStage = bulkStage;
    if (bulkTags.trim()) { payload.tags = splitTags(bulkTags); payload.tagMode = tagMode; }
    if (assignedAdminId) payload.assignedAdminId = assignedAdminId === 'unassigned' ? null : assignedAdminId;
    if (bulkNote.trim()) payload.note = bulkNote.trim();

    if (Object.keys(payload).length === 1) {
      setToast({ message: t('pickActionFirst'), tone: 'danger' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{ updatedCount: number }>('/customers/bulk', { method: 'POST', body: JSON.stringify(payload) });
      setToast({ message: t('bulkSuccess', { n: result.updatedCount }), tone: 'success' });
      setBulkStage(''); setBulkTags(''); setAssignedAdminId(''); setBulkNote(''); setSelectedIds([]);
      await loadCustomers();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : t('bulkError'), tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  }

  return {
    t, customers, admins, selectedIds, selectedSet, allVisibleSelected,
    search, setSearch, stageFilter, setStageFilter, tagFilter, setTagFilter,
    bulkStage, setBulkStage, bulkTags, setBulkTags,
    tagMode, setTagMode, assignedAdminId, setAssignedAdminId, bulkNote, setBulkNote,
    loading, submitting, toast, setToast,
    page, setPage, total,
    canBulkEdit,
    loadCustomers, toggleCustomer, toggleAllVisible, applyBulkAction,
  };
}
