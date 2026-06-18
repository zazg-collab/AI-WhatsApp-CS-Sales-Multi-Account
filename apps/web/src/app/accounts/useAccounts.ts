'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, hasRole } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';
import { dict } from './accounts.i18n';

export interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus: string;
  businessHoursEnabled?: boolean;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessDays?: number[];
  businessTimezone?: string | null;
  awayMessage?: string | null;
  _count?: { conversations: number };
}

const STATUS_PRIORITY: Record<string, number> = {
  banned: 0,
  disconnected: 1,
  qr_required: 2,
  reconnecting: 3,
  paused: 4,
  connecting: 5,
  connected: 6,
};

export function useAccounts() {
  const t = useT(dict);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [qrReceivedAt, setQrReceivedAt] = useState<Record<string, number>>({});
  const [pairingCode, setPairingCode] = useState<Record<string, string>>({});
  const [pairingMode, setPairingMode] = useState<Record<string, 'qr' | 'code'>>({});
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, { liveSocket: boolean; reconnectAttempts: number }>>({});
  const [restarting, setRestarting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; accountName: string; conversationCount: number } | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<{ id: string; accountName: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [requestingCode, setRequestingCode] = useState<Record<string, boolean>>({});

  // Add-account modal (scan-first flow)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<'method' | 'phone' | 'scan' | 'confirm'>('method');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addCreating, setAddCreating] = useState(false);
  const [addedAccountId, setAddedAccountId] = useState<string | null>(null);
  const [addConnectMethod, setAddConnectMethod] = useState<'qr' | 'code' | null>(null);
  const [addRequestingCode, setAddRequestingCode] = useState(false);
  const [addConnected, setAddConnected] = useState(false);
  // Phone entered up front for the pairing-code path (QR path needs nothing).
  const [addCodePhone, setAddCodePhone] = useState('');
  // True once name/phone were auto-filled from device metadata (for the badge).
  const [addAutoDetected, setAddAutoDetected] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const canScan = hasRole('admin');
  const canEditHours = hasRole('supervisor');
  const canDelete = hasRole('supervisor');

  // Mirror addedAccountId into a ref so the socket handler reads the current
  // value without re-subscribing on every change.
  const addedAccountIdRef = useRef<string | null>(null);
  useEffect(() => { addedAccountIdRef.current = addedAccountId; }, [addedAccountId]);

  // Once the new account's device connects, pull its name + number from the
  // live socket (sock.user) and pre-fill the confirm step. Retries briefly
  // because sock.user can lag the 'open' event.
  const fetchMetadataAndConfirm = useCallback(async (accountId: string) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const meta = await api<{ phoneNumber: string | null; suggestedName: string | null }>(
          `/wa/accounts/${accountId}/metadata`,
        );
        if (meta.phoneNumber || meta.suggestedName) {
          if (meta.suggestedName) setAddName(meta.suggestedName);
          if (meta.phoneNumber) setAddPhone(meta.phoneNumber);
          setAddAutoDetected(true);
          setAddConnected(true);
          setAddStep('confirm');
          return;
        }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 800));
    }
    // Connected but metadata unavailable — still let the user fill/confirm.
    setAddConnected(true);
    setAddStep('confirm');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api<Account[]>('/wa/accounts');
      setAccounts(items);
      const healthResults = await Promise.allSettled(
        items.map((a) => api<{ liveSocket: boolean; reconnectAttempts: number }>(`/wa/accounts/${a.id}/health`)),
      );
      const healthMap: Record<string, { liveSocket: boolean; reconnectAttempts: number }> = {};
      items.forEach((a, i) => {
        const r = healthResults[i];
        if (r.status === 'fulfilled') healthMap[a.id] = r.value;
      });
      setHealth(healthMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return;
    const onQr = ({ accountId, qr: dataUrl }: { accountId: string; qr: string }) => {
      setQr((prev) => ({ ...prev, [accountId]: dataUrl }));
      setQrReceivedAt((prev) => ({ ...prev, [accountId]: Date.now() }));
    };
    const onPairingCode = ({ accountId, code }: { accountId: string; code: string }) => {
      setPairingCode((prev) => ({ ...prev, [accountId]: code }));
      setPairingMode((prev) => ({ ...prev, [accountId]: 'code' }));
    };
    const onStatus = ({ accountId: sid, status }: { accountId: string; status: string }) => {
      load();
      if (status === 'connected' && addedAccountIdRef.current === sid) {
        fetchMetadataAndConfirm(sid);
      }
    };
    socket.on('wa:qr', onQr);
    socket.on('wa:pairing-code', onPairingCode);
    socket.on('wa:status', onStatus);
    return () => {
      socket.off('wa:qr', onQr);
      socket.off('wa:pairing-code', onPairingCode);
      socket.off('wa:status', onStatus);
    };
  }, [load, fetchMetadataAndConfirm]);

  const openAddModal = () => {
    setAddModalOpen(true);
    setAddStep('method');
    setAddName('');
    setAddPhone('');
    setAddCodePhone('');
    setAddError(null);
    setAddCreating(false);
    setAddedAccountId(null);
    setAddConnectMethod(null);
    setAddConnected(false);
    setAddAutoDetected(false);
    setAddSaving(false);
  };

  const closeAddModal = useCallback(() => {
    setAddModalOpen(false);
    load();
  }, [load]);

  // QR path — fully scan-first: create with placeholder name/number (the
  // device will report the real ones), then show the QR and wait for connect.
  const startQrFlow = async () => {
    setAddConnectMethod('qr');
    setAddCreating(true);
    setAddError(null);
    try {
      const account = await api<{ id: string }>('/wa/accounts', { method: 'POST', body: JSON.stringify({}) });
      setAddedAccountId(account.id);
      setAddStep('scan');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('addFailed'));
      setAddConnectMethod(null);
    } finally {
      setAddCreating(false);
    }
  };

  // Code path — Baileys needs the target number to generate a pairing code,
  // so collect the phone first; the account *name* still auto-fills on connect.
  const chooseCodeMethod = () => {
    setAddConnectMethod('code');
    setAddError(null);
    setAddStep('phone');
  };

  const submitCodePhone = async () => {
    const digits = addCodePhone.replace(/\D/g, '');
    if (!digits) return;
    setAddCreating(true);
    setAddError(null);
    try {
      const account = await api<{ id: string }>('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: digits }),
      });
      setAddedAccountId(account.id);
      setAddPhone(digits);
      const { code } = await api<{ code: string }>(`/wa/accounts/${account.id}/request-pairing-code`, { method: 'POST' });
      setPairingCode((prev) => ({ ...prev, [account.id]: code }));
      setPairingMode((prev) => ({ ...prev, [account.id]: 'code' }));
      setAddStep('scan');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t('pairingCodeFailed'));
    } finally {
      setAddCreating(false);
    }
  };

  // Persist the (auto-detected, possibly edited) name + number and finish.
  const confirmAndSave = async () => {
    if (!addedAccountId || !addName.trim() || !addPhone.trim()) return;
    setAddSaving(true);
    setAddError(null);
    try {
      await api(`/wa/accounts/${addedAccountId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accountName: addName.trim(), phoneNumber: addPhone.trim() }),
      });
      setAddModalOpen(false);
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('addFailed'));
    } finally {
      setAddSaving(false);
    }
  };

  const restartAccount = async (id: string) => {
    setRestarting(id);
    setActionError(null);
    try {
      await api(`/wa/accounts/${id}/restart`, { method: 'POST' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('restartFailed'));
    }
    setRestarting(null);
    setConfirmRestart(null);
  };

  const requestPairingCode = async (id: string) => {
    setRequestingCode((prev) => ({ ...prev, [id]: true }));
    setActionError(null);
    try {
      const { code } = await api<{ code: string }>(`/wa/accounts/${id}/request-pairing-code`, { method: 'POST' });
      setPairingCode((prev) => ({ ...prev, [id]: code }));
      setPairingMode((prev) => ({ ...prev, [id]: 'code' }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('pairingCodeFailed'));
    } finally {
      setRequestingCode((prev) => ({ ...prev, [id]: false }));
    }
  };

  const deleteAccount = async (id: string) => {
    setDeleting(id);
    setActionError(null);
    try {
      await api(`/wa/accounts/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    }
    setDeleting(null);
    setConfirmDelete(null);
  };

  const copyPairingCode = (id: string) => {
    navigator.clipboard.writeText(pairingCode[id]);
    setCopiedAccountId(id);
    setTimeout(() => setCopiedAccountId(null), 2000);
  };

  const visibleAccounts = accounts
    .filter((a) => !statusFilter || a.sessionStatus === statusFilter)
    .sort((a, b) => (STATUS_PRIORITY[a.sessionStatus] ?? 7) - (STATUS_PRIORITY[b.sessionStatus] ?? 7));

  return {
    // state
    accounts, visibleAccounts, qr, qrReceivedAt, pairingCode, pairingMode, copiedAccountId,
    loading, error, health, restarting, deleting,
    confirmDelete, setConfirmDelete,
    confirmRestart, setConfirmRestart,
    actionError, setActionError,
    statusFilter, setStatusFilter, requestingCode,
    // add-modal state
    addModalOpen, addStep, setAddStep,
    addName, setAddName, addPhone, setAddPhone,
    addCodePhone, setAddCodePhone,
    addError, addCreating, addedAccountId,
    addConnectMethod, setAddConnectMethod,
    addRequestingCode, addConnected,
    addAutoDetected, addSaving,
    // role flags
    canScan, canEditHours, canDelete,
    // actions
    load, openAddModal, closeAddModal,
    startQrFlow, chooseCodeMethod, submitCodePhone, confirmAndSave,
    restartAccount, requestPairingCode, deleteAccount, copyPairingCode,
    setPairingMode,
    t,
  };
}
