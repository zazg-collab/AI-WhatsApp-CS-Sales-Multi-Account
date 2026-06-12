'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-700 text-green-100',
    inactive: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100',
    draft: 'bg-yellow-800 text-yellow-100',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-200 dark:bg-gray-700'}`}>
      {status}
    </span>
  );
}

function sessionDot(status: string) {
  const map: Record<string, string> = {
    connected: 'bg-green-400',
    disconnected: 'bg-gray-300 dark:bg-gray-500',
    qr_required: 'bg-yellow-400',
    banned: 'bg-red-500',
    reconnecting: 'bg-blue-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-gray-300 dark:bg-gray-500'}`} />;
}

// ── PersonaModal ───────────────────────────────────────────────────────────────

function PersonaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Persona) => void;
}) {
  const [form, setForm] = useState<PersonaFormData>({
    name: '',
    soulMd: '',
    tone: '',
    style: '',
    rules: '',
  });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-wa-panel p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">Buat Persona Baru</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Nama Persona</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
              placeholder="mis. Sales Bot Ceria"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Soul.md (kepribadian)</label>
            <textarea
              required
              rows={5}
              value={form.soulMd}
              onChange={(e) => setForm({ ...form, soulMd: e.target.value })}
              className="w-full resize-none rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
              placeholder="Kamu adalah asisten penjualan yang ramah..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Tone</label>
              <input
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
                className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
                placeholder="friendly, formal..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Style</label>
              <input
                value={form.style}
                onChange={(e) => setForm({ ...form, style: e.target.value })}
                className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
                placeholder="concise, detailed..."
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Rules (aturan)</label>
            <textarea
              rows={2}
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
              className="w-full resize-none rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
              placeholder="Jangan berikan harga tanpa persetujuan..."
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              Batal
            </button>
            <button type="submit" disabled={loading} className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {loading ? 'Menyimpan...' : 'Buat Persona'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
        await api(`/bots/${bot.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/bots', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
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
      setError(err instanceof Error ? err.message : 'Gagal assign');
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
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-black/60">
        <div className="w-full max-w-xl rounded-xl bg-white dark:bg-wa-panel p-6 shadow-2xl">
          <h2 className="mb-4 text-lg font-semibold">
            {bot ? `Edit Bot: ${bot.botName}` : 'Buat Bot Baru'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Nama Bot</label>
              <input
                required
                value={form.botName}
                onChange={(e) => setForm({ ...form, botName: e.target.value })}
                className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
                placeholder="mis. Hermes Sales Bot"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-gray-600 dark:text-gray-400">Persona</label>
                <button
                  type="button"
                  onClick={() => setShowPersonaModal(true)}
                  className="text-xs text-wa-accent hover:underline"
                >
                  + Buat Persona Baru
                </button>
              </div>
              <select
                value={form.personaId}
                onChange={(e) => setForm({ ...form, personaId: e.target.value })}
                className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
              >
                <option value="">-- Pilih Persona --</option>
                {localPersonas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Knowledge Base</label>
              <select
                value={form.knowledgeBaseId}
                onChange={(e) => setForm({ ...form, knowledgeBaseId: e.target.value })}
                className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
              >
                <option value="">-- Pilih Knowledge Base --</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Default AI Mode</label>
                <select
                  value={form.defaultAiMode}
                  onChange={(e) => setForm({ ...form, defaultAiMode: e.target.value })}
                  className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-sm outline-none"
                >
                  {aiModes.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Bahasa</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-sm outline-none"
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-sm outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                Batal
              </button>
              <button type="submit" disabled={loading} className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>

          {/* Assign accounts — only when editing */}
          {bot && (
            <div className="mt-4 border-t border-gray-200 dark:border-black/30 pt-4">
              <h3 className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Assign ke Akun WhatsApp</h3>
              <div className="space-y-1">
                {accounts.map((a) => {
                  const assigned = bot.accounts.some((ba) => ba.id === a.id);
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded bg-black/5 dark:bg-black/20 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {sessionDot(a.sessionStatus)}
                        <span className="text-sm">{a.accountName}</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{a.phoneNumber}</span>
                      </div>
                      {assigned ? (
                        <span className="text-xs text-green-400">Assigned</span>
                      ) : (
                        <button
                          onClick={() => handleAssign(a.id)}
                          className="rounded bg-wa-accent px-2 py-0.5 text-xs font-medium text-white"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  );
                })}
                {accounts.length === 0 && (
                  <p className="text-xs text-gray-500">Belum ada akun WhatsApp</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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

function BotCard({
  bot,
  onEdit,
  onDelete,
}: {
  bot: Bot;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-wa-panel p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{bot.botName}</h3>
            {statusBadge(bot.status)}
          </div>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {bot.persona?.name ?? 'No persona'} •{' '}
            {bot.knowledgeBase?.name ?? 'No KB'} •{' '}
            Lang: {bot.language.toUpperCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="rounded bg-black/5 dark:bg-black/30 px-3 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-black/40 dark:hover:bg-black/50"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded bg-red-900/40 px-3 py-1 text-xs text-red-300 hover:bg-red-900/70"
          >
            Hapus
          </button>
        </div>
      </div>

      <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">
        Default mode:{' '}
        <span className="rounded bg-black/5 dark:bg-black/30 px-1.5 py-0.5">{bot.defaultAiMode}</span>
      </div>

      {bot.accounts.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-gray-500">Akun WhatsApp:</p>
          <div className="flex flex-wrap gap-1">
            {bot.accounts.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1 rounded bg-black/5 dark:bg-black/30 px-2 py-0.5 text-xs"
              >
                {sessionDot(a.sessionStatus)}
                {a.accountName}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-600">Belum ada akun yang di-assign</p>
      )}
    </div>
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
      setError(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  }

  return (
    <AppLayout><main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-wa-accent">Bot Manager</h1>
        <button
          onClick={() => setEditBot(null)}
          className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-white"
        >
          + Buat Bot
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-900/40 p-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-xs underline">Tutup</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : bots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500">Belum ada bot. Buat bot pertama Anda!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onEdit={() => setEditBot(bot)}
              onDelete={() => setConfirmDelete(bot)}
            />
          ))}
        </div>
      )}

      {/* Bot create/edit modal */}
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

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="rounded-xl bg-white dark:bg-wa-panel p-6 shadow-2xl">
            <p className="mb-4 text-sm">
              Hapus bot <strong>{confirmDelete.botName}</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="rounded bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </main></AppLayout>
  );
}
