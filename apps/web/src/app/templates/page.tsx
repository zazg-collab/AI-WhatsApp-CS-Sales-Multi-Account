'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, PencilSimple, Trash, ChatText } from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  subtitle: {
    id: 'Balasan CS siap pakai — ketik /shortcut di kolom pesan untuk menyisipkan',
    en: 'Ready-to-use CS replies — type /shortcut in the message box to insert',
  },
  loadFailed: { id: 'Gagal memuat template balasan', en: 'Failed to load reply templates' },
  saveFailed: { id: 'Gagal menyimpan template', en: 'Failed to save template' },
  deleteFailed: { id: 'Gagal menghapus template', en: 'Failed to delete template' },
  formRequired: {
    id: 'Judul dan isi pesan wajib diisi sebelum disimpan.',
    en: 'Title and message body are required before saving.',
  },
  retry: { id: 'Coba lagi', en: 'Try again' },
  editHeading: { id: 'Edit template', en: 'Edit template' },
  newHeading: { id: 'Template baru', en: 'New template' },
  titleLabel: { id: 'Judul', en: 'Title' },
  shortcutLabel: { id: 'Shortcut (opsional)', en: 'Shortcut (optional)' },
  shortcutHint: {
    id: 'Ketik /shortcut di kolom pesan untuk memanggil template ini.',
    en: 'Type /shortcut in the message box to call up this template.',
  },
  accountLabel: { id: 'Akun WhatsApp', en: 'WhatsApp account' },
  globalOption: { id: 'Global (semua akun)', en: 'Global (all accounts)' },
  messageLabel: { id: 'Isi pesan', en: 'Message body' },
  save: { id: 'Simpan', en: 'Save' },
  cancel: { id: 'Batal', en: 'Cancel' },
  noTemplates: { id: 'Belum ada template', en: 'No templates yet' },
  noTemplatesHint: {
    id: 'Buat template pertama lewat form di samping agar tim bisa membalas lebih cepat.',
    en: 'Create your first template using the form beside this so the team can reply faster.',
  },
  globalBadge: { id: 'Global', en: 'Global' },
  edit: { id: 'Edit', en: 'Edit' },
  delete: { id: 'Hapus', en: 'Delete' },
  deleteHeading: { id: 'Hapus template', en: 'Delete template' },
  deleteConfirmAction: { id: 'Hapus template', en: 'Delete template' },
  deletePromptBefore: { id: 'Yakin ingin menghapus ', en: 'Are you sure you want to delete ' },
  deletePromptAfter: {
    id: '? Tindakan ini tidak bisa dibatalkan.',
    en: '? This action cannot be undone.',
  },
};

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
}

interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  whatsappAccountId: string | null;
  whatsappAccount?: { id: string; accountName: string } | null;
}

const EMPTY = { title: '', content: '', shortcut: '', whatsappAccountId: '' };

export default function TemplatesPage() {
  const t = useT(dict);
  const [items, setItems] = useState<QuickReply[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);

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

  async function handleSubmit() {
    if (!form.title.trim() || !form.content.trim()) {
      setFormError(t('formRequired'));
      return;
    }
    setFormError(null);
    const body = {
      title: form.title.trim(),
      content: form.content,
      shortcut: form.shortcut.trim() || undefined,
      whatsappAccountId: form.whatsappAccountId || undefined,
    };
    try {
      if (editingId) {
        await api(`/quick-replies/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...body, whatsappAccountId: form.whatsappAccountId || null }),
        });
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
    setForm({
      title: item.title,
      content: item.content,
      shortcut: item.shortcut ?? '',
      whatsappAccountId: item.whatsappAccountId ?? '',
    });
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

  return (
    <AppLayout>
      <PageHeader
        title="Templates"
        subtitle={t('subtitle')}
      />

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <button onClick={load} className="mt-2 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">
              {t('retry')}
            </button>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Form */}
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {editingId ? t('editHeading') : t('newHeading')}
            </h2>
            {formError && (
              <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">
                {formError}
              </p>
            )}
            <div className="space-y-3">
              <Field
                label={t('titleLabel')}
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Greeting"
              />
              <Field
                label={t('shortcutLabel')}
                hint={t('shortcutHint')}
                value={form.shortcut}
                onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
                placeholder="greeting"
              />
              <SelectField
                label={t('accountLabel')}
                value={form.whatsappAccountId}
                onChange={(e) => setForm((f) => ({ ...f, whatsappAccountId: e.target.value }))}
              >
                <option value="">{t('globalOption')}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountName}</option>
                ))}
              </SelectField>
              <TextareaField
                label={t('messageLabel')}
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Hi, thanks for reaching out to us…"
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button onClick={handleSubmit} className="flex-1">
                  {editingId ? (
                    <>
                      <PencilSimple className="h-4 w-4" aria-hidden="true" />
                      {t('save')}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </>
                  )}
                </Button>
                {editingId && (
                  <Button variant="outline" onClick={resetForm}>
                    {t('cancel')}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* List */}
          <section className="space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => <div key={n} className="h-24 rounded animate-shimmer" />)}
              </div>
            ) : items.length === 0 ? (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <ChatText className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noTemplates')}</p>
                <p className="mt-1 text-[13px] text-gray-400">
                  {t('noTemplatesHint')}
                </p>
              </Card>
            ) : (
              items.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{item.title}</span>
                        {item.shortcut && <Badge tone="hermes">/{item.shortcut}</Badge>}
                        <Badge tone="neutral">{item.whatsappAccount?.accountName ?? t('globalBadge')}</Badge>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{item.content}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                        <PencilSimple className="h-4 w-4" aria-hidden="true" />
                        {t('edit')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(item)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                        <Trash className="h-4 w-4" aria-hidden="true" />
                        {t('delete')}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </section>
        </div>
      </main>

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          size="sm"
          title={t('deleteHeading')}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
              <Button variant="danger" onClick={confirmDelete}>
                <Trash className="h-4 w-4" aria-hidden="true" />
                {t('deleteConfirmAction')}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('deletePromptBefore')}<span className="font-semibold text-gray-900 dark:text-gray-100">{deleting.title}</span>{t('deletePromptAfter')}
          </p>
        </Modal>
      )}
    </AppLayout>
  );
}
