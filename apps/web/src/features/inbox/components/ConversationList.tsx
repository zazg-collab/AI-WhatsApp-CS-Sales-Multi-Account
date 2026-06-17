'use client';

import { useState, useCallback } from 'react';
import { UserPlus, PhoneCall } from '@phosphor-icons/react';
import { useT, type Dict } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { WhatsAppMark } from '@/components/WhatsAppMark';
import { ConversationListItem } from './ConversationListItem';
import type { ConvSummary, WaAccount } from '../inbox.types';

const dict: Dict = {
  searchPlaceholder: { id: 'Cari percakapan...', en: 'Search conversations...' },
  filterAll: { id: 'Semua', en: 'All' },
  filterAttention: { id: 'Perlu tindakan', en: 'Needs action' },
  filterSla: { id: 'SLA berisiko', en: 'SLA at risk' },
  filterUnassigned: { id: 'Belum ditugaskan', en: 'Unassigned' },
  startChat: { id: 'Mulai Chat Baru', en: 'Start New Chat' },
  pickSenderAccount: { id: 'Pilih akun pengirim', en: 'Pick sender account' },
  pickSenderAccountLabel: { id: 'Pilih akun WhatsApp untuk mengirim pesan', en: 'Choose WhatsApp account to send from' },
  phonePlaceholder: { id: 'Nomor telepon', en: 'Phone number' },
  phoneAriaLabel: { id: 'Nomor telepon penerima', en: 'Recipient phone number' },
  namePlaceholder: { id: 'Nama kontak (opsional)', en: 'Contact name (optional)' },
  nameAriaLabel: { id: 'Nama kontak', en: 'Contact name' },
  checkNumber: { id: 'Cek nomor', en: 'Check number' },
  openChat: { id: 'Buka chat', en: 'Open chat' },
  noConversationsFilter: { id: 'Tidak ada percakapan dengan filter ini', en: 'No conversations match this filter' },
};

interface ConversationListProps {
  conversations: ConvSummary[];
  accounts: WaAccount[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onStartChat?: (accountId: string, phone: string, name: string) => Promise<void>;
  onValidateNumber?: (accountId: string, phone: string) => Promise<string>;
  loading?: boolean;
  error?: string | null;
  filter?: 'all' | 'attention' | 'sla' | 'unassigned';
  onFilterChange?: (filter: 'all' | 'attention' | 'sla' | 'unassigned') => void;
}

const filters = [
  { key: 'all', label: 'filterAll' },
  { key: 'attention', label: 'filterAttention' },
  { key: 'sla', label: 'filterSla' },
  { key: 'unassigned', label: 'filterUnassigned' },
] as const;

export function ConversationList({
  conversations,
  accounts,
  activeId,
  onSelect,
  onStartChat,
  onValidateNumber,
  loading,
  error,
  filter = 'all',
  onFilterChange,
}: ConversationListProps) {
  const t = useT(dict);
  const [search, setSearch] = useState('');
  const [startAccountId, setStartAccountId] = useState('');
  const [startPhone, setStartPhone] = useState('');
  const [startName, setStartName] = useState('');
  const [startResult, setStartResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validateNumber = useCallback(async () => {
    if (!onValidateNumber || !startAccountId || !startPhone.trim()) return;
    setBusy(true);
    try {
      const result = await onValidateNumber(startAccountId, startPhone);
      setStartResult(result);
    } catch (err) {
      setStartResult(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  }, [onValidateNumber, startAccountId, startPhone]);

  const startConversation = useCallback(async () => {
    if (!onStartChat || !startAccountId || !startPhone.trim()) return;
    setBusy(true);
    try {
      await onStartChat(startAccountId, startPhone, startName);
      setStartPhone('');
      setStartName('');
      setStartResult(null);
    } catch (err) {
      setStartResult(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setBusy(false);
    }
  }, [onStartChat, startAccountId, startPhone, startName]);

  // Filter conversations by search + filter
  const visible = conversations.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.customer.name?.toLowerCase().includes(q) ||
      c.customer.phoneNumber.includes(q) ||
      c.groupSubject?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    // Apply status filters
    if (filter === 'attention') {
      return c.status === 'open' || c.takeoverStatus === 'waiting_admin';
    }
    if (filter === 'sla') return !!c.slaBreachedAt;
    if (filter === 'unassigned') return !c.assignedAdmin;
    return true; // 'all'
  });

  return (
    <section
      className={cn(
        'shrink-0 flex-col rounded-l border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
        'w-full sm:w-56 md:w-60 lg:w-64 xl:w-72',
        activeId ? 'hidden sm:flex' : 'flex',
      )}
    >
      {/* Search bar */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
        <div className="relative flex-1">
          {/* Search icon would go here */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-gray-800">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange?.(f.key)}
            className={cn(
              'shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-hermes-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {/* Start new chat form */}
      <div className="border-b border-gray-100 p-3 dark:border-gray-800">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">
          <UserPlus className="h-3.5 w-3.5 text-hermes-600" aria-hidden="true" />
          {t('startChat')}
        </div>
        <div className="space-y-2">
          <select
            value={startAccountId}
            onChange={(e) => setStartAccountId(e.target.value)}
            aria-label={t('pickSenderAccountLabel')}
            className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">{t('pickSenderAccount')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountName} ({account.phoneNumber})
              </option>
            ))}
          </select>
          <input
            value={startPhone}
            onChange={(e) => setStartPhone(e.target.value)}
            placeholder={t('phonePlaceholder')}
            aria-label={t('phoneAriaLabel')}
            className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <input
            value={startName}
            onChange={(e) => setStartName(e.target.value)}
            placeholder={t('namePlaceholder')}
            aria-label={t('nameAriaLabel')}
            className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={validateNumber}
              disabled={busy || !startAccountId || !startPhone.trim()}
            >
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              {t('checkNumber')}
            </Button>
            <Button
              size="sm"
              onClick={startConversation}
              disabled={busy || !startAccountId || !startPhone.trim()}
            >
              <WhatsAppMark className="h-4 w-4" />
              {t('openChat')}
            </Button>
          </div>
          {startResult && <p className="text-xs text-gray-500 dark:text-gray-400">{startResult}</p>}
        </div>
      </div>

      {/* Conversation list */}
      <ul className="scrollbar-thin flex-1 overflow-y-auto">
        {error ? (
          <li className="px-4 py-10 text-center text-sm text-danger-600">{error}</li>
        ) : visible.length === 0 && !loading ? (
          <li className="px-4 py-10 text-center text-sm text-gray-400">
            {t('noConversationsFilter')}
          </li>
        ) : (
          visible.map((c) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              isActive={c.id === activeId}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </ul>
    </section>
  );
}
