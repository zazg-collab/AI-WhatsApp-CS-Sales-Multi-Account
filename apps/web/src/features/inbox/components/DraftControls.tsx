'use client';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Check, X, CircleNotch, PencilSimple } from '@/components/ui/core-essential-icons';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type { Message } from '../inbox.types';

interface DraftControlsProps {
  draftMessages: Message[];
  approving?: boolean;
  blocking?: boolean;
  onApprove?: (id: string) => Promise<void>;
  onBlock?: (id: string) => Promise<void>;
  onEdit?: (id: string) => void;
}

export function DraftControls({
  draftMessages,
  approving = false,
  blocking = false,
  onApprove,
  onBlock,
  onEdit,
}: DraftControlsProps) {
  const t = useT(dict);
  const drafts = draftMessages.filter((m) => m.aiGenerated);
  if (drafts.length === 0) return null;

  const multi = drafts.length > 1;

  return (
    <div className="border-b border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge tone="review" className="text-xs">
          {multi ? t('draftHeaderMulti', { count: drafts.length }) : t('draftHeader')}
        </Badge>
        {/* "Setujui semua" cuma menyapu draft yang AMAN — draft yang ditahan
            gerbang uang (temuan Bossfren 2026-08-04) wajib lewat Edit satu-satu,
            jangan pernah ikut ter-approve borongan. */}
        {multi && onApprove && (
          <button
            onClick={() => drafts.filter((d) => !d.moneyGateIssues?.length).forEach((d) => onApprove(d.id))}
            disabled={approving || blocking}
            className="shrink-0 text-xs font-medium text-yellow-700 hover:text-yellow-800 disabled:opacity-50 dark:text-yellow-300 dark:hover:text-yellow-200"
          >
            {t('draftApproveAll')}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-lg border border-yellow-200 bg-white p-2.5 dark:border-yellow-900/30 dark:bg-gray-900">
            {/* Which customer message this draft answers (quoted source) */}
            {draft.quotedMessage && (
              <div className="mb-2 border-l-2 border-yellow-400 pl-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="line-clamp-2">
                  {t('draftAnswers', { body: draft.quotedMessage.content || `[${draft.quotedMessage.messageType}]` })}
                </span>
              </div>
            )}

            <p className="text-sm text-gray-800 dark:text-gray-200">{draft.content}</p>

            {/* >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): alasan penahanan
                gerbang uang ditampilkan di SINI, terpisah dari bubble draft di atas
                — dulu ikut ditulis sebagai prefiks "⚠️ [...]" di dalam content, jadi
                klik Approve tanpa Edit dulu mengirim teks debug internal itu apa
                adanya ke pelanggan. content sekarang selalu bersih; Approve langsung
                dimatikan untuk draft begini, wajib Edit dulu. */}
            {!!draft.moneyGateIssues?.length && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                <p className="font-semibold">⚠️ {t('draftMoneyGateTitle')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {draft.moneyGateIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
                <p className="mt-1">{t('draftMoneyGateHint')}</p>
              </div>
            )}

            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                disabled={approving || blocking || !!draft.moneyGateIssues?.length}
                title={draft.moneyGateIssues?.length ? t('draftMoneyGateApproveDisabled') : undefined}
                onClick={() => onApprove?.(draft.id)}
                className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap"
              >
                {approving ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />} {t('draftApprove')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={approving || blocking}
                onClick={() => onEdit?.(draft.id)}
                className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap"
              >
                <PencilSimple className="h-3.5 w-3.5" aria-hidden="true" /> {t('draftEdit')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={approving || blocking}
                onClick={() => onBlock?.(draft.id)}
                className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap"
              >
                {blocking ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />} {t('draftBlock')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
