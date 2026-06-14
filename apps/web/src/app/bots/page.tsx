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
      setError(err instanceof Error ? err.message : 'Gagal membuat persona');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Persona baru"
      description="Tentukan kepribadian bot yang dipakai untuk menjawab pelanggan."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" form="persona-form" disabled={loading}>{loading ? 'Menyimpan…' : 'Buat persona'}</Button>
        </>
      }
    >
      <form id="persona-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nama persona" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Sales Bot Ceria" />
        <TextareaField label="Soul.md (kepribadian)" required rows={5} value={form.soulMd} onChange={(e) => setForm({ ...form, soulMd: e.target.value })} placeholder="Kamu adalah asisten sales yang ramah…" className="resize-none" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder="ramah, formal…" />
          <Field label="Gaya" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder="ringkas, detail…" />
        </div>
        <TextareaField label="Aturan" rows={2} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder="Jangan sebut harga tanpa persetujuan admin…" className="resize-none" />
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
      setError(err instanceof Error ? err.message : 'Gagal menyimpan bot');
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
      setError(err instanceof Error ? err.message : 'Gagal menugaskan akun');
    }
  }

  const aiModes = [
    { value: 'ai_on', label: 'AI ON' },
    { value: 'ai_off', label: 'AI OFF' },
    { value: 'ai_draft', label: 'Draft' },
    { value: 'ai_supervised', label: 'Supervised' },
  ];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={bot ? `Edit bot: ${bot.botName}` : 'Bot baru'}
        description="Otak chatbot: persona, knowledge base, dan mode AI default."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit" form="bot-form" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan bot'}</Button>
          </>
        }
      >
        <form id="bot-form" onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nama bot" required value={form.botName} onChange={(e) => setForm({ ...form, botName: e.target.value })} placeholder="mis. Hermes Sales Bot" />

          <div>
            <SelectField label="Persona" value={form.personaId} onChange={(e) => setForm({ ...form, personaId: e.target.value })}>
              <option value="">Pilih persona…</option>
              {localPersonas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectField>
            <button type="button" onClick={() => setShowPersonaModal(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-hermes-700 hover:text-hermes-800">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Buat persona baru
            </button>
          </div>

          <SelectField label="Knowledge base" value={form.knowledgeBaseId} onChange={(e) => setForm({ ...form, knowledgeBaseId: e.target.value })}>
            <option value="">Pilih knowledge base…</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </SelectField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField label="Mode AI default" value={form.defaultAiMode} onChange={(e) => setForm({ ...form, defaultAiMode: e.target.value })}>
              {aiModes.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </SelectField>
            <SelectField label="Bahasa" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="id">Indonesia</option>
              <option value="en">English</option>
            </SelectField>
            <SelectField label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </SelectField>
          </div>

          {error && <FormError message={error} />}
        </form>

        {/* Assign accounts — only when editing */}
        {bot && (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="mb-2 text-xs font-semibold text-gray-500">Tugaskan ke akun WhatsApp</h3>
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
                      <Badge tone="success">Ditugaskan</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleAssign(a.id)}>Tugaskan</Button>
                    )}
                  </div>
                );
              })}
              {accounts.length === 0 && <p className="text-xs text-gray-400">Belum ada akun WhatsApp.</p>}
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
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{bot.botName}</h3>
            <Badge tone={statusTone[bot.status] ?? 'neutral'}>{bot.status}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{bot.persona?.name ?? 'Tanpa persona'}</Badge>
            <Badge tone="neutral">{bot.knowledgeBase?.name ?? 'Tanpa KB'}</Badge>
            <Badge tone="neutral">{bot.language.toUpperCase()}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Hapus
          </Button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
        Mode default
        <Badge tone="hermes">{bot.defaultAiMode}</Badge>
      </div>

      {bot.accounts.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-gray-400">Akun WhatsApp</p>
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
        <p className="text-xs text-gray-400">Belum ada akun yang ditugaskan.</p>
      )}
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BotsPage() {
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
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
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
      setError(err instanceof Error ? err.message : 'Gagal menghapus bot');
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Bots & Personas" subtitle="Atur otak chatbot dan tugaskan ke akun WhatsApp">
        <Button size="sm" onClick={() => setEditBot(null)}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Bot baru
        </Button>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            {error}
            <button onClick={() => setError(null)} aria-label="Tutup notifikasi">
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Belum ada bot</p>
            <p className="mt-1 text-[13px] text-gray-400">Buat bot pertama untuk mulai melayani pelanggan otomatis.</p>
            <Button size="sm" className="mt-4" onClick={() => setEditBot(null)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Bot baru
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
            title="Hapus bot"
            onClose={() => setConfirmDelete(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Batal</Button>
                <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Hapus bot
                </Button>
              </>
            }
          >
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Hapus bot <strong>{confirmDelete.botName}</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
          </Modal>
        )}
      </main>
    </AppLayout>
  );
}
