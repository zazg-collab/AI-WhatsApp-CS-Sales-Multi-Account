'use client';

import { useState, useCallback, useEffect } from 'react';
import { UserPlus, PhoneCall, MagnifyingGlass, AddressBook } from '@phosphor-icons/react';
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
  contactSearchPlaceholder: { id: 'Cari kontak tersinkron…', en: 'Search synced contacts…' },
  contactSearchAria: { id: 'Cari kontak WhatsApp tersinkron', en: 'Search synced WhatsApp contacts' },
  pickAccountFirst: { id: 'Pilih akun pengirim dulu untuk mencari kontak', en: 'Pick a sender account first to search contacts' },
  noContactsFound: { id: 'Tidak ada kontak cocok — atau ketik nomor manual di bawah', en: 'No matching contacts — or type a number manually below' },
  orTypeManually: { id: 'atau ketik nomor manual', en: 'or type a number manually' },
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
  onSearchContacts?: (accountId: string, query: string) => Promise<Array<{ phoneNumber: string; name: string }>>;
  loading?: boolean;
  error?: string | null;
  filter?: 'all' | 'attention' | 'sla' | 'unassigned';
  onFilterChange?: (filter: 'all' | 'attention' | 'sla' | 'unassigned') => void;
  /** Controlled search box — the page debounces this into a server-side query. */
  searchValue?: string;
  onSearchChange?: (q: string) => void;
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
  onSearchContacts,
  loading,
  error,
  filter = 'all',
  onFilterChange,
  searchValue = '',
  onSearchChange,
}: ConversationListProps) {
  const t = useT(dict);
  const [startAccountId, setStartAccountId] = useState('');
  const [startPhone, setStartPhone] = useState('');
  const [startName, setStartName] = useState('');
  const [startResult, setStartResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Contact picker — search the synced contact book instead of typing a number.
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Array<{ phoneNumber: string; name: string }>>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

  useEffect(() => {
    if (!onSearchContacts || !startAccountId || manualEntry) { setContactResults([]); return; }
    let cancelled = false;
    setSearchingContacts(true);
    const handle = setTimeout(async () => {
      const results = await onSearchContacts(startAccountId, contactQuery);
      if (!cancelled) { setContactResults(results); setSearchingContacts(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [onSearchContacts, startAccountId, contactQuery, manualEntry]);

  const pickContact = useCallback((contact: { phoneNumber: string; name: string }) => {
    setStartPhone(contact.phoneNumber);
    setStartName(contact.name);
    setContactQuery(contact.name || contact.phoneNumber);
    setContactResults([]);
  }, []);

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
      setContactQuery('');
      setContactResults([]);
      setStartResult(null);
    } catch (err) {
      setStartResult(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setBusy(false);
    }
  }, [onStartChat, startAccountId, startPhone, startName]);

  // Search is server-side (page debounces `searchValue` into the query). Here we
  // only apply the client-side chip filter to the already-matched results.
  const visible = conversations.filter((c) => {
    if (filter === 'attention') return c.takeoverStatus === 'waiting_admin' || c.aiMode === 'ai_paused';
    if (filter === 'sla') return !!c.slaBreachedAt;
    if (filter === 'unassigned') return !c.assignedAdmin;
    return true; // 'all'
  });

  return (
    <section className="flex h-full w-full flex-col rounded-l border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Search bar */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
        <div className="relative flex-1">
          {/* Search icon would go here */}
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
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
          {/* Contact picker: search the synced contact book instead of typing. */}
          {onSearchContacts && !manualEntry ? (
            <div className="relative">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  value={contactQuery}
                  onChange={(e) => { setContactQuery(e.target.value); setStartPhone(''); setStartName(''); }}
                  disabled={!startAccountId}
                  placeholder={startAccountId ? t('contactSearchPlaceholder') : t('pickAccountFirst')}
                  aria-label={t('contactSearchAria')}
                  className="h-8 w-full rounded border border-gray-200 bg-gray-50 pl-7 pr-2 text-xs text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              {startAccountId && contactQuery.trim() && !startPhone && (
                <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-pop dark:border-gray-700 dark:bg-gray-900">
                  {searchingContacts ? (
                    <p className="px-3 py-2 text-xs text-gray-400">…</p>
                  ) : contactResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">{t('noContactsFound')}</p>
                  ) : (
                    contactResults.map((c) => (
                      <button
                        key={c.phoneNumber}
                        type="button"
                        onClick={() => pickContact(c)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <AddressBook className="h-3.5 w-3.5 shrink-0 text-hermes-500" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{c.name || c.phoneNumber}</span>
                          {c.name && <span className="block truncate text-gray-400">{c.phoneNumber}</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <button type="button" onClick={() => { setManualEntry(true); setContactQuery(''); setContactResults([]); }} className="mt-1 text-[11px] font-medium text-hermes-600 hover:underline">
                {t('orTypeManually')}
              </button>
            </div>
          ) : (
            <>
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
            </>
          )}
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
