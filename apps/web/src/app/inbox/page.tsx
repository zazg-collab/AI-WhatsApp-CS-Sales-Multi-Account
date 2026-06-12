'use client';

import { useState } from 'react';
import {
  Search,
  Filter,
  ShieldCheck,
  TriangleAlert,
  CircleX,
  Bot,
  Hand,
  Pencil,
  CircleCheck,
  ArrowUpRight,
  FileSearch,
  ScrollText,
  Send,
  Workflow,
  Phone,
  BookOpen,
  History,
  Clock,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
import { cn } from '@/lib/cn';

/**
 * The Inbox is the operational core: a 3-panel layout.
 *   1. conversation queue + filters
 *   2. chat timeline + composer (with the AI draft / review controls)
 *   3. customer CRM context, Hermes review, risk flags, knowledge sources, audit
 *
 * Data here is illustrative of the layout and the supervised-AI workflow.
 */

type Sender = 'customer' | 'admin' | 'ai';

interface Conversation {
  id: string;
  name: string;
  account: string;
  preview: string;
  time: string;
  unread: number;
  status: StatusKind;
  channel: 'whatsapp';
}

const conversations: Conversation[] = [
  {
    id: '1',
    name: 'Putri Andini',
    account: 'Sales',
    preview: 'Kalau refund prosesnya berapa lama ya kak?',
    time: '2m',
    unread: 2,
    status: 'human-takeover',
    channel: 'whatsapp',
  },
  {
    id: '2',
    name: 'Budi Santoso',
    account: 'CS',
    preview: 'Draft ready for the shipping estimate question',
    time: '4m',
    unread: 1,
    status: 'needs-review',
    channel: 'whatsapp',
  },
  {
    id: '3',
    name: 'Rina Wijaya',
    account: 'Sales',
    preview: 'Saya akan tuntut secara hukum kalau...',
    time: '11m',
    unread: 0,
    status: 'sending-blocked',
    channel: 'whatsapp',
  },
  {
    id: '4',
    name: 'Agus Pratama',
    account: 'CS',
    preview: 'Baik kak, terima kasih infonya',
    time: '12m',
    unread: 0,
    status: 'ai-generated',
    channel: 'whatsapp',
  },
  {
    id: '5',
    name: 'Sari Melati',
    account: 'Sales',
    preview: 'Bisa COD ke daerah Bekasi?',
    time: '20m',
    unread: 0,
    status: 'sent',
    channel: 'whatsapp',
  },
];

const filters = ['All', 'Needs review', 'High risk', 'Takeover', 'Unassigned'];

const messages: { id: string; sender: Sender; text: string; time: string; status?: StatusKind }[] = [
  { id: 'm1', sender: 'customer', text: 'Halo kak, saya mau tanya soal pesanan kemarin', time: '09:41' },
  { id: 'm2', sender: 'admin', text: 'Halo kak Budi, dengan senang hati. Boleh sebutkan nomor pesanannya?', time: '09:42' },
  { id: 'm3', sender: 'customer', text: 'Nomornya INV-20418. Estimasi sampainya kapan ya?', time: '09:44' },
];

export default function InboxPage() {
  const [activeId, setActiveId] = useState('2');
  const [activeFilter, setActiveFilter] = useState('Needs review');
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1">
        {/* ── Panel 1: conversation queue ─────────────────────────── */}
        <section className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:w-80">
          <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search conversations"
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <Button variant="outline" size="sm" title="Filter conversations" aria-label="Filter conversations">
              <Filter className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>

          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-gray-800">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  activeFilter === f
                    ? 'bg-hermes-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      'flex w-full gap-3 border-b border-gray-100 px-3 py-3 text-left transition-colors dark:border-gray-800',
                      isActive
                        ? 'bg-hermes-50/70 dark:bg-hermes-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    )}
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      {/* WhatsApp channel indicator — the only sanctioned green dot. */}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-channel-500 dark:border-gray-900"
                        title="WhatsApp"
                        aria-label="WhatsApp channel"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{c.time}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        {c.preview}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <StatusLabel kind={c.status} />
                        {c.unread > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[10px] font-semibold text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Panel 2: chat timeline + composer ───────────────────── */}
        <section className="flex min-w-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950">
          {/* Conversation header */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {active.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {active.name}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Badge tone="channel">
                    <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    WhatsApp
                  </Badge>
                  <span>{active.account} account</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="hermes">
                <Workflow className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                AI Supervised
              </Badge>
              <Button variant="outline" size="sm">
                <Hand className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Take Over
              </Button>
              <Button variant="outline" size="sm">
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Escalate
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.sender === 'customer' ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[68%] rounded-lg px-3 py-2 text-[13px] leading-relaxed shadow-card',
                    m.sender === 'customer'
                      ? 'rounded-tl-sm bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                      : 'rounded-tr-sm bg-hermes-600 text-white',
                  )}
                >
                  <p>{m.text}</p>
                  <span
                    className={cn(
                      'mt-1 block text-right text-[10px] tabular-nums',
                      m.sender === 'customer' ? 'text-gray-400' : 'text-hermes-100',
                    )}
                  >
                    {m.time}
                  </span>
                </div>
              </div>
            ))}

            {/* AI draft awaiting review — the supervised-send moment. */}
            <div className="flex justify-end">
              <div className="w-[68%] rounded-lg border border-hermes-200 bg-hermes-50 p-3 dark:border-hermes-800 dark:bg-hermes-900/30">
                <div className="mb-2 flex items-center gap-2">
                  <StatusLabel kind="ai-generated" />
                  <StatusLabel kind="needs-review" />
                </div>
                <p className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">
                  Halo kak Budi, pesanan INV-20418 sudah kami proses dan estimasi tiba 2–3 hari
                  kerja ke alamat tujuan. Nanti nomor resi kami kirim begitu paket diserahkan ke
                  kurir ya kak.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm">
                    <CircleCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Approve &amp; Send
                  </Button>
                  <Button variant="outline" size="sm">
                    <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Edit Draft
                  </Button>
                  <Button variant="ghost" size="sm">
                    <FileSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    View Reasoning
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                placeholder="Write a reply, or edit the AI draft above"
                className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <Button size="md">
                <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Send
              </Button>
            </div>
          </div>
        </section>

        {/* ── Panel 3: CRM context + Hermes review + audit ────────── */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex">
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {/* Customer */}
            <div className="border-b border-gray-100 p-4 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {active.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {active.name}
                  </p>
                  <p className="truncate text-xs text-gray-400">+62 813-9087-4421</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                  <p className="text-gray-400">Stage</p>
                  <p className="font-medium text-gray-800 dark:text-gray-100">Warm lead</p>
                </div>
                <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                  <p className="text-gray-400">Lead score</p>
                  <p className="font-medium text-gray-800 dark:text-gray-100">58 / 100</p>
                </div>
              </div>
            </div>

            {/* Hermes review */}
            <div className="border-b border-gray-100 p-4 dark:border-gray-800">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <ShieldCheck className="h-4 w-4 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
                  Hermes AI review
                </h3>
                <Badge tone="review">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Draft only
                </Badge>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-400">Decision</dt>
                  <dd className="font-medium text-gray-800 dark:text-gray-100">Draft for review</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-400">Confidence</dt>
                  <dd className="font-medium tabular-nums text-gray-800 dark:text-gray-100">64</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-400">Risk level</dt>
                  <dd className="font-medium text-review-700">Medium</dd>
                </div>
              </dl>
              <p className="mt-2.5 rounded-md bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Reply is on-policy but quotes a delivery window not confirmed in the knowledge base.
                Recommend a human confirm timing before sending.
              </p>
              <Button variant="ghost" size="sm" className="mt-2 w-full justify-start">
                <FileSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                View Reasoning
              </Button>
            </div>

            {/* Risk flags */}
            <div className="border-b border-gray-100 p-4 dark:border-gray-800">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                Risk flags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="review">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Unverified estimate
                </Badge>
                <Badge tone="neutral">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  SLA 6m remaining
                </Badge>
              </div>
            </div>

            {/* Knowledge sources */}
            <div className="border-b border-gray-100 p-4 dark:border-gray-800">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                <BookOpen className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                Knowledge sources
              </h3>
              <ul className="space-y-1.5 text-xs">
                {['Shipping & delivery policy', 'Order status FAQ'].map((k) => (
                  <li
                    key={k}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5 dark:border-gray-700"
                  >
                    <span className="truncate text-gray-700 dark:text-gray-200">{k}</span>
                    <Badge tone="success">Active</Badge>
                  </li>
                ))}
              </ul>
            </div>

            {/* Audit timeline */}
            <div className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <History className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  Audit timeline
                </h3>
              </div>
              <ol className="space-y-3 text-xs">
                {[
                  { icon: Bot, label: 'AI generated draft', time: '09:45', tone: 'text-hermes-600' },
                  { icon: ShieldCheck, label: 'Hermes flagged for review', time: '09:45', tone: 'text-review-600' },
                  { icon: Hand, label: 'Assigned to you', time: '09:46', tone: 'text-gray-500' },
                ].map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <li key={i} className="flex gap-2.5">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', e.tone)} strokeWidth={1.75} aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-gray-700 dark:text-gray-200">{e.label}</p>
                        <p className="text-gray-400">{e.time}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <Button variant="ghost" size="sm" className="mt-2 w-full justify-start">
                <ScrollText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                View Audit Trail
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </AppLayout>
  );
}
