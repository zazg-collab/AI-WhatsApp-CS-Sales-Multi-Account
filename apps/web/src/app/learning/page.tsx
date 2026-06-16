'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  GraduationCap,
  Sparkle,
  Check,
  X,
  Books,
  User,
  Brain,
  Target,
  CaretDown,
  CaretRight,
  SpinnerGap,
  type Icon,
} from '@phosphor-icons/react';
import { api, hasRole } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

interface Bot {
  id: string;
  botName: string;
}

type ProposalType = 'knowledge' | 'persona' | 'customer_memory' | 'playbook';
type ProposalStatus = 'pending' | 'approved' | 'rejected';

interface Proposal {
  id: string;
  type: ProposalType;
  status: ProposalStatus;
  title: string;
  payload: Record<string, unknown>;
  sourceMessageIds: string[];
  sourceSummary: string | null;
  confidence: number;
  createdAt: string;
  bot: { id: string; botName: string } | null;
  customer: { id: string; name: string | null; phoneNumber: string } | null;
}

interface MineResult {
  knowledge: number;
  persona: number;
  customerMemory: number;
  playbook: number;
  skippedDuplicates: number;
}

const typeMeta: Record<ProposalType, { label: string; icon: Icon; tone: 'hermes' | 'channel' | 'neutral' | 'review' }> = {
  knowledge: { label: 'Knowledge', icon: Books, tone: 'hermes' },
  persona: { label: 'Persona', icon: User, tone: 'channel' },
  customer_memory: { label: 'Memori Pelanggan', icon: Brain, tone: 'neutral' },
  playbook: { label: 'Playbook', icon: Target, tone: 'review' },
};

const statusTabs: { key: ProposalStatus; label: string }[] = [
  { key: 'pending', label: 'Menunggu review' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
];

export default function LearningPage() {
  const canReview = hasRole('owner');
  const [bots, setBots] = useState<Bot[]>([]);
  const [botId, setBotId] = useState('');
  const [tab, setTab] = useState<ProposalStatus>('pending');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [mining, setMining] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    api<Bot[]>('/bots')
      .then((list) => {
        setBots(list);
        if (list[0]) setBotId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat bot'));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status: tab });
    if (botId) params.set('botId', botId);
    api<Proposal[]>(`/learning/proposals?${params.toString()}`)
      .then(setProposals)
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat proposal'))
      .finally(() => setLoading(false));
  }, [tab, botId]);

  useEffect(() => {
    load();
  }, [load]);

  async function mine() {
    if (!botId) return;
    setMining(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<MineResult>(`/learning/bots/${botId}/mine`, { method: 'POST' });
      const total = r.knowledge + r.persona + r.customerMemory + r.playbook;
      setNotice(
        total === 0
          ? 'Tidak ada usulan baru ditemukan dari riwayat. Coba lagi setelah ada lebih banyak percakapan.'
          : `${total} usulan dibuat — Knowledge ${r.knowledge}, Persona ${r.persona}, Playbook ${r.playbook}, Memori ${r.customerMemory}${r.skippedDuplicates ? ` · ${r.skippedDuplicates} duplikat dilewati` : ''}.`,
      );
      setTab('pending');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mining gagal');
    } finally {
      setMining(false);
    }
  }

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(id);
    setError(null);
    try {
      await api(`/learning/proposals/${id}/${action}`, { method: 'POST' });
      setProposals((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : `Gagal ${action}`);
    } finally {
      setActing(null);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="AI Learning — Belajar dari Riwayat"
        subtitle="Tambang knowledge, persona, playbook, dan memori pelanggan dari chat yang sudah ter-sync. Semua perlu persetujuan sebelum aktif."
      >
        <select
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
          aria-label="Pilih bot"
          className="h-9 max-w-44 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          {bots.length === 0 && <option value="">Tidak ada bot</option>}
          {bots.map((b) => (
            <option key={b.id} value={b.id}>{b.botName}</option>
          ))}
        </select>
        <Button onClick={mine} disabled={mining || !botId}>
          {mining ? <SpinnerGap className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkle className="h-4 w-4" aria-hidden="true" />}
          {mining ? 'Menganalisa…' : 'Pelajari dari Riwayat'}
        </Button>
      </PageHeader>

      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {!canReview && (
          <Card className="mb-4 border-review-200 bg-review-50 p-3 text-[13px] text-review-700 dark:border-review-700/40 dark:bg-review-900/20 dark:text-review-300">
            Hanya owner yang dapat menyetujui/menolak usulan. Anda melihat dalam mode baca.
          </Card>
        )}
        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] font-medium text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            {error}
          </Card>
        )}
        {notice && (
          <Card className="mb-4 border-hermes-200 bg-hermes-50 p-3 text-[13px] text-hermes-700 dark:border-hermes-700/40 dark:bg-hermes-900/20 dark:text-hermes-300">
            {notice}
          </Card>
        )}

        {/* Status tabs */}
        <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {statusTabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                tab === tb.key
                  ? 'border-hermes-600 text-hermes-700 dark:text-hermes-300'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => <div key={n} className="h-20 rounded animate-shimmer" />)}
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
            <GraduationCap className="mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="text-sm">
              {tab === 'pending'
                ? 'Belum ada usulan. Klik "Pelajari dari Riwayat" untuk menambang dari chat.'
                : `Tidak ada usulan ${tab === 'approved' ? 'disetujui' : 'ditolak'}.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {proposals.map((p) => {
              const meta = typeMeta[p.type];
              const Icon = meta.icon;
              const open = expanded === p.id;
              return (
                <li key={p.id}>
                  <Card className="overflow-hidden">
                    <div className="flex items-start gap-3 p-3.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="text-[11px] tabular-nums text-gray-400">
                            confidence {p.confidence}
                          </span>
                          {p.bot && <span className="text-[11px] text-gray-400">· {p.bot.botName}</span>}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{p.title}</p>
                        {p.sourceSummary && (
                          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{p.sourceSummary}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : p.id)}
                          className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-hermes-600 hover:underline dark:text-hermes-400"
                        >
                          {open ? <CaretDown className="h-3.5 w-3.5" /> : <CaretRight className="h-3.5 w-3.5" />}
                          {open ? 'Sembunyikan' : 'Lihat usulan'}
                          {p.sourceMessageIds.length > 0 && (
                            <span className="text-gray-400">· {p.sourceMessageIds.length} pesan sumber</span>
                          )}
                        </button>
                      </div>
                      {p.status === 'pending' && canReview && (
                        <div className="flex shrink-0 gap-1.5">
                          <Button size="sm" onClick={() => act(p.id, 'approve')} disabled={acting === p.id}>
                            <Check className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Setujui</span>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => act(p.id, 'reject')} disabled={acting === p.id}>
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                      {p.status !== 'pending' && (
                        <Badge tone={p.status === 'approved' ? 'hermes' : 'neutral'}>
                          {p.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                        </Badge>
                      )}
                    </div>
                    {open && (
                      <div className="border-t border-gray-100 bg-gray-50 p-3.5 dark:border-gray-800 dark:bg-gray-800/40">
                        <ProposalBody type={p.type} payload={p.payload} />
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function ProposalBody({ type, payload }: { type: ProposalType; payload: Record<string, unknown> }) {
  if (type === 'persona') {
    return (
      <div className="space-y-2 text-[13px]">
        <Field label="Soul / deskripsi" value={String(payload.soulMd ?? '')} multiline />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tone" value={String(payload.tone ?? '—')} />
          <Field label="Style" value={String(payload.style ?? '—')} />
        </div>
        {payload.rules ? <Field label="Aturan" value={String(payload.rules)} multiline /> : null}
        {Array.isArray(payload.forbiddenWords) && payload.forbiddenWords.length > 0 && (
          <Field label="Kata terlarang" value={(payload.forbiddenWords as string[]).join(', ')} />
        )}
      </div>
    );
  }
  if (type === 'customer_memory') {
    const facts = Array.isArray(payload.facts) ? (payload.facts as string[]) : [];
    return (
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-700 dark:text-gray-200">
        {facts.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
    );
  }
  // knowledge / playbook
  return (
    <div className="space-y-2 text-[13px]">
      <Field label="Isi" value={String(payload.content ?? '')} multiline />
      {payload.category ? <Field label="Kategori" value={String(payload.category)} /> : null}
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn('text-gray-800 dark:text-gray-100', multiline && 'whitespace-pre-wrap leading-relaxed')}>{value || '—'}</p>
    </div>
  );
}
