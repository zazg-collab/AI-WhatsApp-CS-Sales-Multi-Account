'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Workflow, X } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

// ── i18n ───────────────────────────────────────────────────────────────────────

const dict: Dict = {
  // FormError fallbacks
  errCreatePersona: { id: 'Gagal membuat persona', en: 'Failed to create persona' },
  errSaveBot: { id: 'Gagal menyimpan bot', en: 'Failed to save bot' },
  errAssignAccount: { id: 'Gagal menugaskan akun', en: 'Failed to assign account' },
  errLoadData: { id: 'Gagal memuat data', en: 'Gagal memuat data' },
  errDeleteBot: { id: 'Gagal menghapus bot', en: 'Failed to delete bot' },

  // PersonaModal
  personaTitle: { id: 'Persona baru', en: 'New persona' },
  personaDesc: { id: 'Tentukan kepribadian bot yang dipakai untuk menjawab pelanggan.', en: 'Define the bot personality used to answer customers.' },
  cancel: { id: 'Batal', en: 'Cancel' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  createPersona: { id: 'Buat persona', en: 'Create persona' },
  personaNameLabel: { id: 'Nama persona', en: 'Persona name' },
  personaNamePlaceholder: { id: 'mis. Sales Bot Ceria', en: 'e.g. Cheerful Sales Bot' },
  soulMdLabel: { id: 'Soul.md (kepribadian)', en: 'Soul.md (personality)' },
  soulMdPlaceholder: { id: 'Kamu adalah asisten sales yang ramah…', en: 'You are a friendly sales assistant…' },
  toneLabel: { id: 'Tone', en: 'Tone' },
  tonePlaceholder: { id: 'ramah, formal…', en: 'friendly, formal…' },
  styleLabel: { id: 'Gaya', en: 'Style' },
  stylePlaceholder: { id: 'ringkas, detail…', en: 'concise, detailed…' },
  rulesLabel: { id: 'Aturan', en: 'Rules' },
  rulesPlaceholder: { id: 'Jangan sebut harga tanpa persetujuan admin…', en: 'Do not quote prices without admin approval…' },

  // BotModal
  editBotTitle: { id: 'Edit bot: {name}', en: 'Edit bot: {name}' },
  newBotTitle: { id: 'Bot baru', en: 'New bot' },
  botDesc: { id: 'Otak chatbot: persona, knowledge base, dan mode AI default.', en: 'Chatbot brain: persona, knowledge base, and default AI mode.' },
  saveBot: { id: 'Simpan bot', en: 'Save bot' },
  botNameLabel: { id: 'Nama bot', en: 'Bot name' },
  botNamePlaceholder: { id: 'mis. Hermes Sales Bot', en: 'e.g. Hermes Sales Bot' },
  personaLabel: { id: 'Persona', en: 'Persona' },
  choosePersona: { id: 'Pilih persona…', en: 'Choose persona…' },
  createNewPersona: { id: 'Buat persona baru', en: 'Create new persona' },
  kbLabel: { id: 'Knowledge base', en: 'Knowledge base' },
  chooseKb: { id: 'Pilih knowledge base…', en: 'Choose knowledge base…' },
  defaultAiModeLabel: { id: 'Mode AI default', en: 'Default AI mode' },
  aiModeOn: { id: 'AI ON', en: 'AI ON' },
  aiModeOff: { id: 'AI OFF', en: 'AI OFF' },
  aiModeDraft: { id: 'Draft', en: 'Draft' },
  aiModeSupervised: { id: 'Supervised', en: 'Supervised' },
  languageLabel: { id: 'Bahasa', en: 'Language' },
  languageId: { id: 'Indonesia', en: 'Indonesian' },
  languageEn: { id: 'English', en: 'English' },
  statusLabel: { id: 'Status', en: 'Status' },
  statusDraft: { id: 'Draft', en: 'Draft' },
  statusActive: { id: 'Aktif', en: 'Active' },
  statusInactive: { id: 'Nonaktif', en: 'Inactive' },
  assignToAccounts: { id: 'Tugaskan ke akun WhatsApp', en: 'Assign to WhatsApp accounts' },
  assigned: { id: 'Ditugaskan', en: 'Assigned' },
  assign: { id: 'Tugaskan', en: 'Assign' },
  noWaAccounts: { id: 'Belum ada akun WhatsApp.', en: 'No WhatsApp accounts yet.' },

  // BotCard
  noPersona: { id: 'Tanpa persona', en: 'No persona' },
  noKb: { id: 'Tanpa KB', en: 'No KB' },
  edit: { id: 'Edit', en: 'Edit' },
  delete: { id: 'Hapus', en: 'Delete' },
  defaultMode: { id: 'Mode default', en: 'Default mode' },
  waAccounts: { id: 'Akun WhatsApp', en: 'WhatsApp accounts' },
  noAssignedAccounts: { id: 'Belum ada akun yang ditugaskan.', en: 'No accounts assigned yet.' },

  // Main page
  pageSubtitle: { id: 'Atur otak chatbot dan tugaskan ke akun WhatsApp', en: 'Manage chatbot brains and assign them to WhatsApp accounts' },
  newBotBtn: { id: 'Bot baru', en: 'New bot' },
  closeNotif: { id: 'Tutup notifikasi', en: 'Close notification' },
  noBots: { id: 'Belum ada bot', en: 'No bots yet' },
  noBotsHint: { id: 'Buat bot pertama untuk mulai melayani pelanggan otomatis.', en: 'Create your first bot to start serving customers automatically.' },
  deleteBotTitle: { id: 'Hapus bot', en: 'Delete bot' },
  deleteBotBtn: { id: 'Hapus bot', en: 'Delete bot' },
  deleteBotConfirmPre: { id: 'Hapus bot ', en: 'Delete bot ' },
  deleteBotConfirmPost: { id: '? Tindakan ini tidak bisa dibatalkan.', en: '? This action cannot be undone.' },
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Persona {
  id: string;
  name: string;
  soulMd: string;
  tone: string | null;
  style: string | null;
  rules: string | null;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus: string;
}

interface Bot {
  id: string;
  botName: string;
  defaultAiMode: string;
  language: string;
  status: string;
  persona: Persona | null;
  knowledgeBase: { id: string; name: string } | null;
  accounts: WaAccount[];
}

interface BotFormData {
  botName: string;
  personaId: string;
  knowledgeBaseId: string;
  defaultAiMode: string;
  language: string;
  status: string;
}

interface PersonaFormData {
  name: string;
  soulMd: string;
  tone: string;
  style: string;
  rules: string;
}

// ── Shared bits ──────────────────────────────────────────────────────────────────

type BadgeTone = 'success' | 'review' | 'neutral';
const statusTone: Record<string, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  draft: 'review',
};

// Connection dot colour by session status.
function sessionDot(status: string) {
  const map: Record<string, string> = {
    connected: 'bg-channel-500',
    disconnected: 'bg-gray-300 dark:bg-gray-600',
    qr_required: 'bg-review-500',
    banned: 'bg-danger-500',
    reconnecting: 'bg-hermes-500',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-gray-300 dark:bg-gray-600'}`} aria-hidden="true" />;
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">
      {message}
    </p>
  );
}

// ── PersonaModal ───────────────────────────────────────────────────────────────

function PersonaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Persona) => void }) {
  const t = useT(dict);
  const [form, setForm] = useState<PersonaFormData>({ name: '', soulMd: '', tone: '', style: '', rules: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await api<Persona>('/bots/personas', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          soulMd: form.soulMd,
          tone: form.tone || undefined,
          style: form.style || undefined,
          rules: form.rules || undefined,
        }),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errCreatePersona'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('personaTitle')}
      description={t('personaDesc')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="persona-form" disabled={loading}>{loading ? t('saving') : t('createPersona')}</Button>
        </>
      }
    >
      <form id="persona-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label={t('personaNameLabel')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('personaNamePlaceholder')} />
        <TextareaField label={t('soulMdLabel')} required rows={5} value={form.soulMd} onChange={(e) => setForm({ ...form, soulMd: e.target.value })} placeholder={t('soulMdPlaceholder')} className="resize-none" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('toneLabel')} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder={t('tonePlaceholder')} />
          <Field label={t('styleLabel')} value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder={t('stylePlaceholder')} />
        </div>
        <TextareaField label={t('rulesLabel')} rows={2} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder={t('rulesPlaceholder')} className="resize-none" />
        {error && <FormError message={error} />}
      </form>
    </Modal>
  );
}

// ── BotModal ───────────────────────────────────────────────────────────────────

function BotModal({
  bot,
  personas,
  knowledgeBases,
  accounts,
  onClose,
  onSaved,
}: {
  bot: Bot | null;
  personas: Persona[];
  knowledgeBases: KnowledgeBase[];
  accounts: WaAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT(dict);
  const [form, setForm] = useState<BotFormData>({
    botName: bot?.botName ?? '',
    personaId: bot?.persona?.id ?? '',
    knowledgeBaseId: bot?.knowledgeBase?.id ?? '',
    defaultAiMode: bot?.defaultAiMode ?? 'ai_draft',
    language: bot?.language ?? 'id',
    status: bot?.status ?? 'draft',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [localPersonas, setLocalPersonas] = useState(personas);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        botName: form.botName,
        personaId: form.personaId || undefined,
        knowledgeBaseId: form.knowledgeBaseId || undefined,
        defaultAiMode: form.defaultAiMode,
        language: form.language,
        status: form.status,
      };
      if (bot) {
        await api(`/bots/${bot.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/bots', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSaveBot'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(accountId: string) {
    if (!bot) return;
    try {
      await api(`/bots/${bot.id}/assign/${accountId}`, { method: 'POST' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errAssignAccount'));
    }
  }

  const aiModes = [
    { value: 'ai_on', label: t('aiModeOn') },
    { value: 'ai_off', label: t('aiModeOff') },
    { value: 'ai_draft', label: t('aiModeDraft') },
    { value: 'ai_supervised', label: t('aiModeSupervised') },
  ];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={bot ? t('editBotTitle', { name: bot.botName }) : t('newBotTitle')}
        description={t('botDesc')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" form="bot-form" disabled={loading}>{loading ? t('saving') : t('saveBot')}</Button>
          </>
        }
      >
        <form id="bot-form" onSubmit={handleSubmit} className="space-y-3">
          <Field label={t('botNameLabel')} required value={form.botName} onChange={(e) => setForm({ ...form, botName: e.target.value })} placeholder={t('botNamePlaceholder')} />

          <div>
            <SelectField label={t('personaLabel')} value={form.personaId} onChange={(e) => setForm({ ...form, personaId: e.target.value })}>
              <option value="">{t('choosePersona')}</option>
              {localPersonas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectField>
            <button type="button" onClick={() => setShowPersonaModal(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-hermes-700 hover:text-hermes-800">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t('createNewPersona')}
            </button>
          </div>

          <SelectField label={t('kbLabel')} value={form.knowledgeBaseId} onChange={(e) => setForm({ ...form, knowledgeBaseId: e.target.value })}>
            <option value="">{t('chooseKb')}</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </SelectField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField label={t('defaultAiModeLabel')} value={form.defaultAiMode} onChange={(e) => setForm({ ...form, defaultAiMode: e.target.value })}>
              {aiModes.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </SelectField>
            <SelectField label={t('languageLabel')} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="id">{t('languageId')}</option>
              <option value="en">{t('languageEn')}</option>
            </SelectField>
            <SelectField label={t('statusLabel')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">{t('statusDraft')}</option>
              <option value="active">{t('statusActive')}</option>
              <option value="inactive">{t('statusInactive')}</option>
            </SelectField>
          </div>

          {error && <FormError message={error} />}
        </form>

        {/* Assign accounts — only when editing */}
        {bot && (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="mb-2 text-xs font-semibold text-gray-500">{t('assignToAccounts')}</h3>
            <div className="space-y-1.5">
              {accounts.map((a) => {
                const assigned = bot.accounts.some((ba) => ba.id === a.id);
                return (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                    <div className="flex items-center gap-2">
                      {sessionDot(a.sessionStatus)}
                      <span className="text-sm text-gray-800 dark:text-gray-200">{a.accountName}</span>
                      <span className="text-xs text-gray-400">{a.phoneNumber}</span>
                    </div>
                    {assigned ? (
                      <Badge tone="success">{t('assigned')}</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleAssign(a.id)}>{t('assign')}</Button>
                    )}
                  </div>
                );
              })}
              {accounts.length === 0 && <p className="text-xs text-gray-400">{t('noWaAccounts')}</p>}
            </div>
          </div>
        )}
      </Modal>

      {showPersonaModal && (
        <PersonaModal
          onClose={() => setShowPersonaModal(false)}
          onCreated={(p) => {
            setLocalPersonas((prev) => [...prev, p]);
            setForm((f) => ({ ...f, personaId: p.id }));
            setShowPersonaModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Bot Card ───────────────────────────────────────────────────────────────────

function BotCard({ bot, onEdit, onDelete }: { bot: Bot; onEdit: () => void; onDelete: () => void }) {
  const t = useT(dict);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{bot.botName}</h3>
            <Badge tone={statusTone[bot.status] ?? 'neutral'}>{bot.status}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{bot.persona?.name ?? t('noPersona')}</Badge>
            <Badge tone="neutral">{bot.knowledgeBase?.name ?? t('noKb')}</Badge>
            <Badge tone="neutral">{bot.language.toUpperCase()}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t('edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t('delete')}
          </Button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
        {t('defaultMode')}
        <Badge tone="hermes">{bot.defaultAiMode}</Badge>
      </div>

      {bot.accounts.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-gray-400">{t('waAccounts')}</p>
          <div className="flex flex-wrap gap-1">
            {bot.accounts.map((a) => (
              <span key={a.id} className="flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {sessionDot(a.sessionStatus)}
                {a.accountName}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t('noAssignedAccounts')}</p>
      )}
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BotsPage() {
  const t = useT(dict);
  const [bots, setBots] = useState<Bot[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editBot, setEditBot] = useState<Bot | null | undefined>(undefined); // undefined = closed, null = new
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
  }, []);

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

  return (
    <AppLayout>
      <PageHeader title="Bots & Personas" subtitle={t('pageSubtitle')}>
        <Button size="sm" onClick={() => setEditBot(null)}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {t('newBotBtn')}
        </Button>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            {error}
            <button onClick={() => setError(null)} aria-label={t('closeNotif')}>
              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-32 rounded animate-shimmer" />)}
          </div>
        ) : bots.length === 0 ? (
          <Card className="flex flex-col items-center justify-center border-dashed py-16 text-center">
            <Workflow className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noBots')}</p>
            <p className="mt-1 text-[13px] text-gray-400">{t('noBotsHint')}</p>
            <Button size="sm" className="mt-4" onClick={() => setEditBot(null)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {t('newBotBtn')}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {bots.map((bot) => (
              <BotCard key={bot.id} bot={bot} onEdit={() => setEditBot(bot)} onDelete={() => setConfirmDelete(bot)} />
            ))}
          </div>
        )}

        {editBot !== undefined && (
          <BotModal
            bot={editBot}
            personas={personas}
            knowledgeBases={kbs}
            accounts={accounts}
            onClose={() => setEditBot(undefined)}
            onSaved={() => {
              setEditBot(undefined);
              load();
            }}
          />
        )}

        {confirmDelete && (
          <Modal
            open
            size="sm"
            title={t('deleteBotTitle')}
            onClose={() => setConfirmDelete(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('cancel')}</Button>
                <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t('deleteBotBtn')}
                </Button>
              </>
            }
          >
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {t('deleteBotConfirmPre')}<strong>{confirmDelete.botName}</strong>{t('deleteBotConfirmPost')}
            </p>
          </Modal>
        )}
      </main>
    </AppLayout>
  );
}
