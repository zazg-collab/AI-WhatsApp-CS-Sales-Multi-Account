'use client';

import { MagnifyingGlass, ArrowsClockwise, AddressBook } from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Toast } from '@/components/ui/Toast';
import { formatPhone } from '@/lib/contact';
import { useCustomers, stages, stageTone, stageLabelKey, PAGE_SIZE } from './useCustomers';

const inputClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

export default function CustomersPage() {
  const {
    t, customers, admins, selectedSet, allVisibleSelected,
    search, setSearch, stageFilter, setStageFilter, tagFilter, setTagFilter,
    bulkStage, setBulkStage, bulkTags, setBulkTags,
    tagMode, setTagMode, assignedAdminId, setAssignedAdminId, bulkNote, setBulkNote,
    loading, submitting, toast, setToast,
    page, setPage, total,
    canBulkEdit,
    loadCustomers, toggleCustomer, toggleAllVisible, applyBulkAction,
  } = useCustomers();

  const selectedCount = [...selectedSet].length;

  return (
    <AppLayout>
      <PageHeader title="Contacts" subtitle={t('subtitle')}>
        <Badge tone="neutral">{t('loadedCount', { n: customers.length })}</Badge>
      </PageHeader>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Filters */}
        <section className="border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-2 lg:grid-cols-[1fr_180px_180px_auto]">
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or number…" aria-label={t('searchAria')} className={`${inputClass} w-full pl-8`} />
            </div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label={t('stageFilterAria')} className={inputClass}>
              <option value="">{t('allStages')}</option>
              {stages.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
            </select>
            <input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder={t('tagFilterPlaceholder')} aria-label={t('tagFilterAria')} className={inputClass} />
            <Button variant="outline" size="md" onClick={loadCustomers}>
              <ArrowsClockwise className="h-4 w-4" aria-hidden="true" />{t('reload')}
            </Button>
          </div>
        </section>

        {/* Bulk action bar */}
        {canBulkEdit && (
          <section className={`border-b border-gray-200 px-5 py-3 transition-colors dark:border-gray-800 ${selectedCount > 0 ? 'bg-gray-50 dark:bg-gray-950' : 'bg-gray-50/50 dark:bg-gray-950/50'}`}>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              <span className={`font-semibold ${selectedCount > 0 ? 'text-hermes-600' : 'text-gray-400'}`}>{selectedCount}</span> {t('selectedCount')}
              <span className="ml-2 text-gray-400">{t('bulkLimit')}</span>
            </div>
            <div className={`grid gap-2 xl:grid-cols-[150px_1fr_140px_220px_1fr_auto] ${selectedCount === 0 ? 'pointer-events-none opacity-50' : ''}`}>
              <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} aria-label={t('changeStageAria')} className={inputClass}>
                <option value="">{t('changeStage')}</option>
                {stages.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
              </select>
              <input value={bulkTags} onChange={(e) => setBulkTags(e.target.value)} placeholder={t('bulkTagsPlaceholder')} aria-label={t('bulkTagsAria')} className={inputClass} />
              <select value={tagMode} onChange={(e) => setTagMode(e.target.value as 'append' | 'replace' | 'remove')} aria-label={t('tagModeAria')} className={inputClass}>
                <option value="append">{t('tagAppend')}</option>
                <option value="replace">{t('tagReplace')}</option>
                <option value="remove">{t('tagRemove')}</option>
              </select>
              <select value={assignedAdminId} onChange={(e) => setAssignedAdminId(e.target.value)} aria-label={t('assignAdminAria')} className={inputClass}>
                <option value="">{t('assignAdmin')}</option>
                <option value="unassigned">{t('noAdmin')}</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
              </select>
              <input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder={t('bulkNotePlaceholder')} aria-label={t('bulkNoteAria')} className={inputClass} />
              <Button size="md" onClick={applyBulkAction} disabled={submitting || selectedCount === 0}>
                {submitting ? t('applying') : t('apply')}
              </Button>
            </div>
          </section>
        )}

        {toast && (
          <div className="mx-5 mt-3 self-start">
            <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
          </div>
        )}

        <div className="scrollbar-thin flex-1 overflow-auto p-5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-14 rounded-lg animate-shimmer" />)}
            </div>
          ) : customers.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <AddressBook className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('emptyTitle')}</p>
              <p className="mt-1 text-[13px] text-gray-400">{t('emptyHint')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadCustomers}>
                <ArrowsClockwise className="h-4 w-4" aria-hidden="true" />{t('retry')}
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label={t('selectAllAria')} className="accent-hermes-600" />
                    </th>
                    <th className="px-4 py-3 font-medium">{t('colCustomer')}</th>
                    <th className="px-4 py-3 font-medium">{t('colStage')}</th>
                    <th className="px-4 py-3 font-medium">{t('colTag')}</th>
                    <th className="px-4 py-3 font-medium">{t('colAdmin')}</th>
                    <th className="px-4 py-3 font-medium">{t('colLastContact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedSet.has(customer.id)} onChange={() => toggleCustomer(customer.id)} aria-label={t('selectRow', { name: customer.name || customer.phoneNumber })} className="accent-hermes-600" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={customer.name} phone={customer.phoneNumber} avatarUrl={customer.avatarUrl} className="h-8 w-8 text-[11px] font-semibold" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900 dark:text-gray-100">{customer.name || t('noName')}</div>
                            <div className="text-xs text-gray-400">{formatPhone(customer.phoneNumber, t('hiddenNumber'))}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={stageTone[customer.leadStage]}>{t(stageLabelKey[customer.leadStage])}</Badge>
                        <span className="ml-2 text-xs tabular-nums text-gray-400">{t('score', { n: customer.leadScore })}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {customer.tags.length === 0 ? (
                            <span className="text-xs text-gray-400">{t('noTag')}</span>
                          ) : (
                            customer.tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {customer.assignedAdmin?.name || customer.assignedAdmin?.email || <span className="text-gray-400">{t('unassigned')}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {customer.lastMessageAt ? new Date(customer.lastMessageAt).toLocaleString('id-ID') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
