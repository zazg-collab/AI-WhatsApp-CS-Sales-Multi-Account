'use client';

import { useEffect, useState, useCallback, useId } from 'react';
import { Plus, Pencil, Trash2, Workflow, X } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, fieldControl } from '@/components/ui/Field';

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

// ── Shared styles ────────────────────────────────────────────────────────────────

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
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-gray-300 dark:bg-gray-600'}`} />;
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
      setError(err instanceof Error ? err.message : 'Failed to create persona');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New persona" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Persona name">
          {(id) => <input id={id} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldControl} placeholder="e.g. Cheerful Sales Bot" />}
        </Field>
        <Field label="Soul.md (personality)">
          {(id) => <textarea id={id} required rows={5} value={form.soulMd} onChange={(e) => setForm({ ...form, soulMd: e.target.value })} className={`resize-none ${fieldControl}`} placeholder="You are a friendly sales assistant…" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone">
            {(id) => <input id={id} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className={fieldControl} placeholder="friendly, formal…" />}
          </Field>
          <Field label="Style">
            {(id) => <input id={id} value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className={fieldControl} placeholder="concise, detailed…" />}
          </Field>
        </div>
        <Field label="Rules">
          {(id) => <textarea id={id} rows={2} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} className={`resize-none ${fieldControl}`} placeholder="Don't quote prices without approval…" />}
        </Field>
        {error && <p className="text-xs text-danger-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Create persona'}</Button>
        </div>
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
  const personaSelectId = useId();

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
      setError(err instanceof Error ? err.message : 'Failed to save');
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
      setError(err instanceof Error ? err.message : 'Failed to assign');
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
      <Modal title={bot ? `Edit bot: ${bot.botName}` : 'New bot'} onClose={onClose} size="lg">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Bot name">
            {(id) => <input id={id} required value={form.botName} onChange={(e) => setForm({ ...form, botName: e.target.value })} className={fieldControl} placeholder="e.g. Hermes Sales Bot" />}
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={personaSelectId} className="text-xs font-medium text-gray-600 dark:text-gray-300">Persona</label>
              <button type="button" onClick={() => setShowPersonaModal(true)} className="inline-flex items-center gap-1 text-xs font-medium text-hermes-600 hover:text-hermes-700">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                New persona
              </button>
            </div>
            <select id={personaSelectId} value={form.personaId} onChange={(e) => setForm({ ...form, personaId: e.target.value })} className={fieldControl}>
              <option value="">Select persona…</option>
              {localPersonas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <Field label="Knowledge base">
            {(id) => (
              <select id={id} value={form.knowledgeBaseId} onChange={(e) => setForm({ ...form, knowledgeBaseId: e.target.value })} className={fieldControl}>
                <option value="">Select knowledge base…</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Default AI mode">
              {(id) => (
                <select id={id} value={form.defaultAiMode} onChange={(e) => setForm({ ...form, defaultAiMode: e.target.value })} className={fieldControl}>
                  {aiModes.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Language">
              {(id) => (
                <select id={id} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={fieldControl}>
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              )}
            </Field>
            <Field label="Status">
              {(id) => (
                <select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fieldControl}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              )}
            </Field>
          </div>

          {error && <p className="text-xs text-danger-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>

        {/* Assign accounts — only when editing */}
        {bot && (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="mb-2 text-xs font-semibold text-gray-500">Assign to WhatsApp accounts</h3>
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
                      <Badge tone="success">Assigned</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleAssign(a.id)}>Assign</Button>
                    )}
                  </div>
                );
              })}
              {accounts.length === 0 && <p className="text-xs text-gray-400">No WhatsApp accounts yet.</p>}
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
            <Badge tone="neutral">{bot.persona?.name ?? 'No persona'}</Badge>
            <Badge tone="neutral">{bot.knowledgeBase?.name ?? 'No KB'}</Badge>
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
            Delete
          </Button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
        Default mode
        <Badge tone="hermes">{bot.defaultAiMode}</Badge>
      </div>

      {bot.accounts.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-gray-400">WhatsApp accounts</p>
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
        <p className="text-xs text-gray-400">No accounts assigned yet.</p>
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
      setError(err instanceof Error ? err.message : 'Failed to load data');
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
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Bots & Personas" subtitle="Configure chatbot brains and assign them to accounts">
        <Button size="sm" onClick={() => setEditBot(null)}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          New bot
        </Button>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : bots.length === 0 ? (
          <Card className="flex flex-col items-center justify-center border-dashed py-16 text-center">
            <Workflow className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm text-gray-400">No bots yet. Create your first bot.</p>
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
          <Modal title="Delete bot" onClose={() => setConfirmDelete(null)} size="sm">
            <p className="mb-4 text-sm text-gray-700 dark:text-gray-200">
              Delete bot <strong>{confirmDelete.botName}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Delete
              </Button>
            </div>
          </Modal>
        )}
      </main>
    </AppLayout>
  );
}
