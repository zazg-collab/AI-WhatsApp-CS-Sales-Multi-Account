'use client';

import { useEffect, useState, useCallback } from 'react';
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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; accountName: string } | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<{ id: string; accountName: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [requestingCode, setRequestingCode] = useState<Record<string, boolean>>({});

  // Add-account modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<'details' | 'connect'>('details');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addCreating, setAddCreating] = useState(false);
  const [addedAccountId, setAddedAccountId] = useState<string | null>(null);
  const [addConnectMethod, setAddConnectMethod] = useState<'qr' | 'code' | null>(null);
  const [addRequestingCode, setAddRequestingCode] = useState(false);
  const [addConnected, setAddConnected] = useState(false);

  const canScan = hasRole('admin');
  const canEditHours = hasRole('supervisor');
  const canDelete = hasRole('supervisor');

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
      if (status === 'connected') {
        setAddedAccountId((prev) => { if (prev === sid) setAddConnected(true); return prev; });
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
  }, [load]);

  const openAddModal = () => {
    setAddModalOpen(true);
    setAddStep('details');
    setAddName('');
    setAddPhone('');
    setAddError(null);
    setAddCreating(false);
    setAddedAccountId(null);
    setAddConnectMethod(null);
    setAddConnected(false);
  };

  const closeAddModal = useCallback(() => {
    setAddModalOpen(false);
    load();
  }, [load]);

  const handleAddCreate = async () => {
    if (!addName.trim() || !addPhone.trim()) return;
    setAddCreating(true);
    setAddError(null);
    try {
      const account = await api<{ id: string }>('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ accountName: addName.trim(), phoneNumber: addPhone.trim() }),
      });
      setAddedAccountId(account.id);
      setAddStep('connect');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('addFailed'));
    } finally {
      setAddCreating(false);
    }
  };

  const handleAddRequestPairingCode = async () => {
    if (!addedAccountId) return;
    setAddRequestingCode(true);
    setAddError(null);
    try {
      const { code } = await api<{ code: string }>(`/wa/accounts/${addedAccountId}/request-pairing-code`, { method: 'POST' });
      setPairingCode((prev) => ({ ...prev, [addedAccountId]: code }));
      setPairingMode((prev) => ({ ...prev, [addedAccountId]: 'code' }));
      setAddConnectMethod('code');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t('pairingCodeFailed'));
    } finally {
      setAddRequestingCode(false);
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
    addError, addCreating, addedAccountId,
    addConnectMethod, setAddConnectMethod,
    addRequestingCode, addConnected,
    // role flags
    canScan, canEditHours, canDelete,
    // actions
    load, openAddModal, closeAddModal,
    handleAddCreate, handleAddRequestPairingCode,
    restartAccount, requestPairingCode, deleteAccount, copyPairingCode,
    setPairingMode,
    t,
  };
}
