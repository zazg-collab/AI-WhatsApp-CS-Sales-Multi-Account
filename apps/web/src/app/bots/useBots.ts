'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './bots.i18n';

export interface Persona {
  id: string;
  name: string;
  soulMd: string;
  tone: string | null;
  style: string | null;
  rules: string | null;
  forbiddenWords?: string[]; // >>> ANGGA: ditegakkan Sentinel (rules.engine.ts) <<<
}

export interface KnowledgeBase {
  id: string;
  name: string;
}

export interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus: string;
  /** >>> ANGGA: mode yang SEDANG berlaku di akun ini — inilah yang diwarisi
   *  percakapan baru, bukan `Bot.defaultAiMode`. <<< */
  aiMode?: string;
}

export interface Bot {
  id: string;
  botName: string;
  defaultAiMode: string;
  language: string;
  status: string;
  persona: Persona | null;
  knowledgeBase: { id: string; name: string } | null;
  accounts: WaAccount[];
}

export type BadgeTone = 'success' | 'review' | 'neutral';

export const statusTone: Record<string, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  draft: 'review',
};

export function useBots() {
  const t = useT(dict);
  const [bots, setBots] = useState<Bot[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // undefined = modal closed, null = create new, Bot = edit existing
  const [editBot, setEditBot] = useState<Bot | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Bot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [botsData, personasData, kbsData, accountsData] = await Promise.all([
        api<Bot[]>('/bots'),
        api<Persona[]>('/bots/personas/list'),
        api<{ items: KnowledgeBase[] }>('/knowledge-bases'),
        api<WaAccount[]>('/wa/accounts'),
      ]);
      setBots(botsData);
      setPersonas(personasData);
      setKbs(kbsData.items ?? (kbsData as unknown as KnowledgeBase[]));
      setAccounts(accountsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errLoadData'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(bot: Bot) {
    try {
      await api(`/bots/${bot.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errDeleteBot'));
    }
  }

  return {
    t, bots, personas, kbs, accounts,
    loading, error, setError,
    editBot, setEditBot,
    confirmDelete, setConfirmDelete,
    load, handleDelete,
  };
}
