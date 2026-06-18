'use client';

import { Plus, PencilSimple, Trash, ChatText, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useTemplates } from './useTemplates';

export default function TemplatesPage() {
  const {
    t, items, accounts, form, setForm, editingId, error, formError, loading, deleting, setDeleting,
    search, setSearch, accountFilter, setAccountFilter,
    visible, hasFilters, liveConflict,
    load, resetForm, handleSubmit, startEdit, confirmDelete,
  } = useTemplates();

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <button onClick={load} className="mt-2 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">{t('retry')}</button>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{editingId ? t('editHeading') : t('newHeading')}</h2>
            {formError && <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">{formError}</p>}
            <div className="space-y-3">
              <Field label={t('titleLabel')} required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('titlePlaceholder')} />
              <div>
                <Field label={t('shortcutLabel')} hint={liveConflict ? undefined : t('shortcutHint')} value={form.shortcut} onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))} placeholder={t('shortcutPlaceholder')} />
                {liveConflict && <p className="mt-1 flex items-center gap-1 text-[12px] text-review-600 dark:text-review-400"><Warning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('shortcutDuplicate', { shortcut: form.shortcut.trim() })}</p>}
              </div>
              <SelectField label={t('accountLabel')} value={form.whatsappAccountId} onChange={(e) => setForm((f) => ({ ...f, whatsappAccountId: e.target.value }))}>
                <option value="">{t('globalOption')}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
              </SelectField>
              <div>
                <TextareaField label={t('messageLabel')} required rows={5} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={t('messagePlaceholder')} className="resize-none" />
                <p className="mt-1 text-[11px] text-gray-400">{t('tokenHint')}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit} className="flex-1" disabled={!!liveConflict}>
                  {editingId ? (<><PencilSimple className="h-4 w-4" aria-hidden="true" />{t('save')}</>) : (<><Plus className="h-4 w-4" aria-hidden="true" />{t('addBtn')}</>)}
                </Button>
                {editingId && <Button variant="outline" onClick={resetForm}>{t('cancel')}</Button>}
              </div>
            </div>
          </Card>

          <section>
            {!loading && items.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </div>
                {accounts.length > 0 && (
                  <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-[13px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                    <option value="">{t('filterAccount')}</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
                )}
              </div>
            )}
            <div className="space-y-2">
              {loading ? (
                [1,2,3].map((n) => <div key={n} className="h-24 rounded animate-shimmer" />)
              ) : visible.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center">
                  <ChatText className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{hasFilters ? t('noMatch') : t('noTemplates')}</p>
                  <p className="mt-1 text-[13px] text-gray-400">{hasFilters ? t('noMatchHint') : t('noTemplatesHint')}</p>
                </Card>
              ) : (
                visible.map((item) => (
                  <Card key={item.id} className={`p-4 ${editingId === item.id ? 'ring-2 ring-hermes-400' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{item.title}</span>
                          {item.shortcut && <Badge tone="hermes">/{item.shortcut}</Badge>}
                          <Badge tone="neutral">{item.whatsappAccount?.accountName ?? t('globalBadge')}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{item.content}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => startEdit(item)}><PencilSimple className="h-4 w-4" aria-hidden="true" />{t('edit')}</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(item)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10"><Trash className="h-4 w-4" aria-hidden="true" />{t('delete')}</Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} size="sm" title={t('deleteHeading')}
          footer={<><Button variant="outline" onClick={() => setDeleting(null)}>{t('cancel')}</Button><Button variant="danger" onClick={confirmDelete}><Trash className="h-4 w-4" aria-hidden="true" />{t('deleteConfirmAction')}</Button></>}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('deletePromptBefore')}<span className="font-semibold text-gray-900 dark:text-gray-100">{deleting.title}</span>{t('deletePromptAfter')}</p>
        </Modal>
      )}
    </AppLayout>
  );
}
