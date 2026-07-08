'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from '../customers.i18n';
import type { Customer } from '../useCustomers';

export type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';

/** Unified timeline event (matches CustomersService.timeline). */
export interface TimelineEvent {
  type: 'message' | 'sentinel_review' | 'follow_up';
  at: string;
  data: Record<string, unknown>;
}

export function useCustomerDetail(id: string) {
  const t = useT(dict);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingOptOut, setSavingOptOut] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, tl] = await Promise.all([
        api<Customer>(`/customers/${id}`),
        api<TimelineEvent[]>(`/customers/${id}/timeline`),
      ]);
      setCustomer(c);
      setTimeline(Array.isArray(tl) ? tl : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detailErrLoad'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async () => {
    const body = note.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    try {
      const updated = await api<Customer>(`/customers/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: body }),
      });
      setCustomer(updated);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detailErrNote'));
    } finally {
      setSavingNote(false);
    }
  }, [id, note, savingNote, t]);

  const setLeadStage = useCallback(async (leadStage: LeadStage) => {
    if (savingStage) return;
    setSavingStage(true);
    try {
      const updated = await api<Customer>(`/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ leadStage }),
      });
      setCustomer(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detailErrUpdate'));
    } finally {
      setSavingStage(false);
    }
  }, [id, savingStage, t]);

  const setOptedOut = useCallback(async (optedOut: boolean) => {
    if (savingOptOut) return;
    setSavingOptOut(true);
    try {
      await api(`/campaigns/${optedOut ? 'opt-out' : 'opt-in'}`, {
        method: 'POST',
        body: JSON.stringify({ customerId: id }),
      });
      // opt-out/opt-in return a partial customer; refetch for the full shape.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detailErrUpdate'));
    } finally {
      setSavingOptOut(false);
    }
  }, [id, savingOptOut, load, t]);

  return {
    t, customer, timeline, loading, error, load,
    note, setNote, addNote, savingNote,
    setLeadStage, savingStage,
    setOptedOut, savingOptOut,
  };
}
