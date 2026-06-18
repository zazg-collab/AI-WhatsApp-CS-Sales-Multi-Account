import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';

export interface AccountSetupState {
  step: 'method' | 'scan' | 'metadata' | 'confirm';
  method: 'qr' | 'code' | null;
  accountId: string | null;
  phoneNumber: string;
  accountName: string;
  suggestedPhoneNumber: string | null;
  suggestedName: string | null;
  loading: boolean;
  error: string | null;
}

export function useAccountSetup() {
  const toast = useToast();
  const [state, setState] = useState<AccountSetupState>({
    step: 'method',
    method: null,
    accountId: null,
    phoneNumber: '',
    accountName: '',
    suggestedPhoneNumber: null,
    suggestedName: null,
    loading: false,
    error: null,
  });

  const metadataPollingRef = useState<NodeJS.Timeout | null>(null)[1];

  const startWithQr = useCallback(async () => {
    setState((s) => ({ ...s, method: 'qr', step: 'scan', loading: true, error: null }));
    try {
      const account = await api('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ accountName: 'New Account', phoneNumber: '000000000000' }),
      });
      setState((s) => ({ ...s, accountId: account.id, loading: false }));
      pollMetadata(account.id);
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed to create account' }));
    }
  }, []);

  const startWithCode = useCallback(async () => {
    setState((s) => ({ ...s, method: 'code', step: 'scan', loading: true, error: null }));
    try {
      const account = await api('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({ accountName: 'New Account', phoneNumber: '000000000000' }),
      });
      setState((s) => ({ ...s, accountId: account.id, loading: false }));
      pollMetadata(account.id);
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed to create account' }));
    }
  }, []);

  const pollMetadata = useCallback((accountId: string) => {
    const poll = setInterval(async () => {
      try {
        const metadata = await api(`/wa/accounts/${accountId}/metadata`);
        if (metadata.phoneNumber) {
          clearInterval(poll);
          setState((s) => ({
            ...s,
            step: 'metadata',
            suggestedPhoneNumber: metadata.phoneNumber,
            suggestedName: metadata.suggestedName,
            phoneNumber: metadata.phoneNumber,
            accountName: metadata.suggestedName || 'New Account',
          }));
        }
      } catch (err) {
        console.warn('Metadata poll error:', err);
      }
    }, 1500);
    metadataPollingRef = poll;
  }, [metadataPollingRef]);

  const moveToConfirm = useCallback(() => {
    setState((s) => ({ ...s, step: 'confirm' }));
  }, []);

  const updatePhoneNumber = useCallback((phone: string) => {
    setState((s) => ({ ...s, phoneNumber: phone }));
  }, []);

  const updateAccountName = useCallback((name: string) => {
    setState((s) => ({ ...s, accountName: name }));
  }, []);

  const confirmCreate = useCallback(async () => {
    if (!state.accountId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await api(`/wa/accounts/${state.accountId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accountName: state.accountName.trim(), phoneNumber: state.phoneNumber }),
      });
      setState((s) => ({ ...s, loading: false }));
      return { success: true, accountId: state.accountId };
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed to confirm account' }));
      return { success: false };
    }
  }, [state.accountId, state.phoneNumber, state.accountName]);

  const reset = useCallback(() => {
    if (metadataPollingRef) clearInterval(metadataPollingRef);
    setState({
      step: 'method',
      method: null,
      accountId: null,
      phoneNumber: '',
      accountName: '',
      suggestedPhoneNumber: null,
      suggestedName: null,
      loading: false,
      error: null,
    });
  }, [metadataPollingRef]);

  return {
    state,
    startWithQr,
    startWithCode,
    moveToConfirm,
    updatePhoneNumber,
    updateAccountName,
    confirmCreate,
    reset,
  };
}
