'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './templates.i18n';

export interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
}

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  whatsappAccountId: string | null;
  whatsappAccount?: { id: string; accountName: string } | null;
}

const EMPTY = { title: '', content: '', shortcut: '', whatsappAccountId: '' };

export function useTemplates() {
  const t = useT(dict);
  const [items, setItems] = useState<QuickReply[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const [list, accs] = await Promise.all([
        api<QuickReply[]>('/quick-replies'),
        api<WaAccount[]>('/wa/accounts'),
      ]);
      setItems(list);
      setAccounts(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
    setFormError(null);
  }

  function shortcutConflict(shortcut: string): QuickReply | undefined {
    const s = shortcut.trim().toLowerCase();
    if (!s) return undefined;
    return items.find((it) => it.id !== editingId && it.shortcut?.toLowerCase() === s);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.content.trim()) { setFormError(t('formRequired')); return; }
    const conflict = shortcutConflict(form.shortcut);
    if (conflict) { setFormError(t('shortcutDuplicate', { shortcut: form.shortcut.trim() })); return; }
    setFormError(null);
    const body = {
      title: form.title.trim(),
      content: form.content,
      shortcut: form.shortcut.trim() || undefined,
      whatsappAccountId: form.whatsappAccountId || undefined,
    };
    try {
      if (editingId) {
        await api(`/quick-replies/${editingId}`, { method: 'PATCH', body: JSON.stringify({ ...body, whatsappAccountId: form.whatsappAccountId || null }) });
      } else {
        await api('/quick-replies', { method: 'POST', body: JSON.stringify(body) });
      }
      resetForm();
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  function startEdit(item: QuickReply) {
    setEditingId(item.id);
    setFormError(null);
    setForm({ title: item.title, content: item.content, shortcut: item.shortcut ?? '', whatsappAccountId: item.whatsappAccountId ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    try {
      await api(`/quick-replies/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      setDeleting(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deleteFailed'));
      setDeleting(null);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (accountFilter && item.whatsappAccountId !== accountFilter) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q) || (item.shortcut ?? '').toLowerCase().includes(q);
    });
  }, [items, search, accountFilter]);

  const hasFilters = search.trim() !== '' || accountFilter !== '';
  const liveConflict = form.shortcut.trim() ? shortcutConflict(form.shortcut) : undefined;

  return {
    t, items, accounts, form, setForm, editingId, error, formError, loading, deleting, setDeleting,
    search, setSearch, accountFilter, setAccountFilter,
    visible, hasFilters, liveConflict,
    load, resetForm, handleSubmit, startEdit, confirmDelete,
  };
}
