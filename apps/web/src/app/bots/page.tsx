'use client';

import { useState } from 'react';
import { Plus, PencilSimple, Trash, ArrowsSplit, X } from '@/components/ui/core-essential-icons';
import { api } from '@/lib/api';
import { SessionStatusBadge } from '@/components/ui/SessionStatusBadge';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useT } from '@/lib/i18n';
import { useBots, statusTone, type Bot, type Persona, type KnowledgeBase, type WaAccount } from './useBots';
import { dict } from './bots.i18n';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function sessionDot(status: string) {
  return <SessionStatusBadge status={status} variant="dot" />;
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-400">
      {message}
    </p>
  );
}

// ── PersonaModal ───────────────────────────────────────────────────────────────

function PersonaModal({ onClose, onCreated, persona }: { onClose: () => void; onCreated: (p: Persona) => void; persona?: Persona }) {
  const t = useT(dict);
  // >>> ANGGA: `forbidden` disimpan sebagai teks berkoma di form, dipecah jadi array saat dikirim
  const [form, setForm] = useState({ name: persona?.name ?? '', soulMd: persona?.soulMd ?? '', tone: persona?.tone ?? '', style: persona?.style ?? '', rules: persona?.rules ?? '', forbidden: (persona?.forbiddenWords ?? []).join(', ') });
  // <<< ANGGA
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const saved = await api<Persona>(persona ? `/bots/personas/${persona.id}` : '/bots/personas', {
        method: persona ? 'PATCH' : 'POST',
        // >>> ANGGA: forbiddenWords selalu dikirim (array kosong = hapus daftarnya)
        body: JSON.stringify({ name: form.name, soulMd: form.soulMd, tone: form.tone || undefined, style: form.style || undefined, rules: form.rules || undefined, forbiddenWords: form.forbidden.split(',').map((w) => w.trim()).filter(Boolean) }),
        // <<< ANGGA
      });
      onCreated(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errCreatePersona'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={persona ? t('editPersonaTitle') : t('personaTitle')} description={persona ? undefined : t('personaDesc')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="persona-form" disabled={loading}>{loading ? t('saving') : (persona ? t('savePersona') : t('createPersona'))}</Button>
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
        {/* >>> ANGGA: isian kata terlarang — kolomnya sudah lama ada di DB, formnya belum */}
        <div>
          <Field label={t('forbiddenLabel')} value={form.forbidden} onChange={(e) => setForm({ ...form, forbidden: e.target.value })} placeholder={t('forbiddenPlaceholder')} />
          <p className="mt-1 text-xs text-gray-400">{t('forbiddenHint')}</p>
        </div>
        {/* <<< ANGGA */}
        {error && <FormError message={error} />}
      </form>
    </Modal>
  );
}

// ── BotModal ───────────────────────────────────────────────────────────────────

function BotModal({ bot, personas, knowledgeBases, accounts, onClose, onSaved, onChanged }: {
  bot: Bot | null;
  personas: Persona[];
  knowledgeBases: KnowledgeBase[];
  accounts: WaAccount[];
  onClose: () => void;
  onSaved: () => void;
  onChanged?: () => void;
}) {
  const t = useT(dict);
  const [form, setForm] = useState({
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
  const [showActivate, setShowActivate] = useState(false);
  const [localPersonas, setLocalPersonas] = useState(personas);
  const [assignedIds, setAssignedIds] = useState<string[]>(() => bot?.accounts.map((a) => a.id) ?? []);

  const needsActivationConfirm = form.defaultAiMode === 'ai_on' && (!bot || bot.defaultAiMode !== 'ai_on');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsActivationConfirm) { setShowActivate(true); return; }
    doSave();
  }

  async function doSave() {
    setShowActivate(false);
    setLoading(true);
    setError(null);
    try {
      const payload = { botName: form.botName, personaId: form.personaId || undefined, knowledgeBaseId: form.knowledgeBaseId || undefined, defaultAiMode: form.defaultAiMode, language: form.language, status: form.status };
      if (bot) await api(`/bots/${bot.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/bots', { method: 'POST', body: JSON.stringify(payload) });
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
      setAssignedIds((prev) => (prev.includes(accountId) ? prev : [...prev, accountId]));
      onChanged?.();
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

  const aiModeHelp: Record<string, string> = {
    ai_on: t('aiModeHelpOn'), ai_off: t('aiModeHelpOff'),
    ai_draft: t('aiModeHelpDraft'), ai_supervised: t('aiModeHelpSupervised'),
  };

  return (
    <>
      <Modal open onClose={onClose} size="lg"
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
              {localPersonas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <button type="button" onClick={() => setShowPersonaModal(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-sentinel-700 hover:text-sentinel-800">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('createNewPersona')}
            </button>
          </div>
          <SelectField label={t('kbLabel')} value={form.knowledgeBaseId} onChange={(e) => setForm({ ...form, knowledgeBaseId: e.target.value })}>
            <option value="">{t('chooseKb')}</option>
            {knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
          </SelectField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField label={t('defaultAiModeLabel')} value={form.defaultAiMode} onChange={(e) => setForm({ ...form, defaultAiMode: e.target.value })}>
              {aiModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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
          <p className={`rounded-md px-3 py-2 text-xs ${form.defaultAiMode === 'ai_on' ? 'bg-danger-50 text-danger-700 dark:bg-danger-900/20 dark:text-danger-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {aiModeHelp[form.defaultAiMode]}
          </p>
          {/* >>> ANGGA: dua keterangan ini menjelaskan kapan field-nya berlaku.
              Sebelumnya dua-duanya tersimpan tapi tidak berefek apa pun, dan
              tidak ada satu kata pun di UI yang memberi tahu. */}
          <p className="text-xs text-gray-400">{t('defaultAiModeScope')}</p>
          <p className="text-xs text-gray-400">{t('statusScope')}</p>
          {/* <<< ANGGA */}
          {error && <FormError message={error} />}
        </form>

        {bot && (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="mb-2 text-xs font-semibold text-gray-500">{t('assignToAccounts')}</h3>
            <div className="space-y-1.5">
              {accounts.map((a) => {
                const assigned = assignedIds.includes(a.id);
                const autonomousButOffline = form.defaultAiMode === 'ai_on' && a.sessionStatus !== 'connected';
                return (
                  <div key={a.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {sessionDot(a.sessionStatus)}
                        <span className="text-sm text-gray-800 dark:text-gray-200">{a.accountName}</span>
                        <span className="text-xs text-gray-400">{a.phoneNumber}</span>
                      </div>
                      {assigned ? <Badge tone="success">{t('assigned')}</Badge> : <Button size="sm" onClick={() => handleAssign(a.id)}>{t('assign')}</Button>}
                    </div>
                    {autonomousButOffline && <p className="mt-1.5 text-[11px] text-review-600 dark:text-review-400">{t('assignDisconnectedWarn')}</p>}
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

      {showActivate && (
        <Modal open size="sm" title={t('activateTitle')} onClose={() => setShowActivate(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowActivate(false)}>{t('cancel')}</Button>
              <Button variant="danger" onClick={doSave} disabled={loading}>{loading ? t('saving') : t('activateConfirm')}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('activateBody', { name: form.botName })}</p>
        </Modal>
      )}
    </>
  );
}

// ── BotCard ────────────────────────────────────────────────────────────────────

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
          <Button variant="outline" size="sm" onClick={onEdit}><PencilSimple className="h-4 w-4" aria-hidden="true" />{t('edit')}</Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
            <Trash className="h-4 w-4" aria-hidden="true" />{t('delete')}
          </Button>
        </div>
      </div>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
        {t('defaultMode')}<Badge tone="sentinel">{bot.defaultAiMode}</Badge>
      </div>
      {bot.accounts.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-gray-400">{t('waAccounts')}</p>
          <div className="flex flex-wrap gap-1">
            {/* >>> ANGGA: mode akun ditampilkan APA ADANYA di sebelah namanya.
                Dulu kartu ini cuma menulis "Default mode: ai_supervised" lalu
                "WhatsApp accounts: Yanvee" — dua baris yang masing-masing benar,
                tapi berdampingan membuat orang menyimpulkan Yanvee jalan
                supervised, padahal ia `ai_draft`. Sekarang kalau keduanya
                berbeda, bedanya kelihatan; itu justru gunanya. */}
            {bot.accounts.map((a) => {
              const beda = !!a.aiMode && a.aiMode !== bot.defaultAiMode;
              return (
                <span key={a.id} className="flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {sessionDot(a.sessionStatus)}{a.accountName}
                  {a.aiMode && (
                    <span
                      title={beda ? t('accountModeDiffers') : t('accountModeHint')}
                      className={
                        beda
                          ? 'rounded px-1 font-medium text-review-700 dark:text-review-400'
                          : 'rounded px-1 text-gray-400'
                      }
                    >
                      {a.aiMode}
                    </span>
                  )}
                </span>
              );
            })}
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
  const { t, bots, personas, kbs, accounts, loading, error, setError, editBot, setEditBot, confirmDelete, setConfirmDelete, load, handleDelete } = useBots();
  const [editPersona, setEditPersona] = useState<Persona | undefined>(undefined);
  const [confirmDeletePersona, setConfirmDeletePersona] = useState<Persona | null>(null);
  const [showNewPersona, setShowNewPersona] = useState(false);

  async function handleDeletePersona(p: Persona) {
    try {
      await api(`/bots/personas/${p.id}`, { method: 'DELETE' });
      setConfirmDeletePersona(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <AppLayout>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')}>
        <Button size="sm" onClick={() => setEditBot(null)}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t('newBotBtn')}
        </Button>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            {error}
            <button onClick={() => setError(null)} aria-label={t('closeNotif')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-32 rounded animate-shimmer" />)}
          </div>
        ) : bots.length === 0 ? (
          <Card className="flex flex-col items-center justify-center border-dashed py-16 text-center">
            <ArrowsSplit className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('noBots')}</p>
            <p className="mt-1 text-[13px] text-gray-400">{t('noBotsHint')}</p>
            <Button size="sm" className="mt-4" onClick={() => setEditBot(null)}>
              <Plus className="h-4 w-4" aria-hidden="true" />{t('newBotBtn')}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {bots.map((bot) => (
              <BotCard key={bot.id} bot={bot} onEdit={() => setEditBot(bot)} onDelete={() => setConfirmDelete(bot)} />
            ))}
          </div>
        )}

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('personasSection')}</h2>
            <Button size="sm" variant="outline" onClick={() => setShowNewPersona(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t('createPersona')}</Button>
          </div>
          {personas.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noPersonas')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {personas.map((p) => (
                <Card key={p.id} className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                    {p.tone && <p className="text-xs text-gray-400">{p.tone}{p.style ? ` · ${p.style}` : ''}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setEditPersona(p)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label={t('editPersonaTitle')}><PencilSimple className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDeletePersona(p)} className="rounded p-1 text-gray-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-900/20" aria-label={t('deletePersonaTitle')}><Trash className="h-3.5 w-3.5" /></button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {editBot !== undefined && (
          <BotModal
            bot={editBot}
            personas={personas}
            knowledgeBases={kbs}
            accounts={accounts}
            onClose={() => setEditBot(undefined)}
            onSaved={() => { setEditBot(undefined); load(); }}
            onChanged={load}
          />
        )}

        {confirmDelete && (
          <Modal open size="sm" title={t('deleteBotTitle')} onClose={() => setConfirmDelete(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('cancel')}</Button>
                <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>
                  <Trash className="h-4 w-4" aria-hidden="true" />{t('deleteBotBtn')}
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

      {(editPersona !== undefined) && (
        <PersonaModal
          persona={editPersona}
          onClose={() => setEditPersona(undefined)}
          onCreated={() => { setEditPersona(undefined); load(); }}
        />
      )}

      {showNewPersona && (
        <PersonaModal
          onClose={() => setShowNewPersona(false)}
          onCreated={() => { setShowNewPersona(false); load(); }}
        />
      )}

      {confirmDeletePersona && (
        <Modal open size="sm" title={t('deletePersonaTitle')} onClose={() => setConfirmDeletePersona(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDeletePersona(null)}>{t('cancel')}</Button>
              <Button variant="danger" onClick={() => handleDeletePersona(confirmDeletePersona)}>
                <Trash className="h-4 w-4" aria-hidden="true" />{t('deletePersonaBtn')}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('deletePersonaBody')}</p>
          <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{confirmDeletePersona.name}</p>
        </Modal>
      )}
    </AppLayout>
  );
}
