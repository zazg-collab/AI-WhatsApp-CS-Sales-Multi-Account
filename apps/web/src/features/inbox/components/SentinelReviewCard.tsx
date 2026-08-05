'use client';

import { Badge } from '@/components/ui/Badge';
import type { ConvDetail, Message } from '../inbox.types';

interface SentinelReviewCardProps {
  conversation: ConvDetail;
  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): draft yang sedang
  // ditampilkan ke admin, kalau ada. Sebelumnya kartu ini SELALU baca
  // `conversation.sentinelReviews[0]` (review TERAKHIR se-percakapan) —
  // begitu ada draft baru yang belum direview (mis. ditahan gerbang uang)
  // atau draft untuk topik lain, kartu menampilkan review basi yang tidak
  // nyambung ke draft yang sedang dilihat admin. Opsional & default kosong
  // supaya pemanggil lama (tanpa draft aktif) tetap jalan seperti sebelumnya.
  draftMessages?: Message[];
}

const riskTone: Record<string, 'success' | 'review' | 'danger'> = {
  low: 'success',
  medium: 'review',
  high: 'review',
  critical: 'danger',
};

export function SentinelReviewCard({ conversation, draftMessages = [] }: SentinelReviewCardProps) {
  // Draft paling baru yang sedang menunggu approval — kalau ada, review-nya
  // SENDIRI yang relevan buat admin, bukan review lama se-percakapan.
  const activeDraft = draftMessages.length ? draftMessages[draftMessages.length - 1] : null;
  const review = activeDraft ? (activeDraft.sentinelReview ?? null) : (conversation.sentinelReviews[0] ?? null);

  if (activeDraft && !review) {
    return (
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Draft ini belum direview Sentinel.
        </p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No Sentinel review for this conversation yet.
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Cordova AI review{!activeDraft ? ' (riwayat)' : ''}
      </h3>

      {/* Scores */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Confidence</span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-12 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${review.confidenceScore}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {review.confidenceScore}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Risk</span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-12 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full ${
                  review.riskScore > 70
                    ? 'bg-red-500'
                    : review.riskScore > 40
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${review.riskScore}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {review.riskScore}%
            </span>
          </div>
        </div>
      </div>

      {/* Decision + Risk level */}
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="review" className="text-xs capitalize">
          {review.decision.replace('_', ' ')}
        </Badge>
        <Badge tone={riskTone[review.riskLevel] || 'review'} className="text-xs capitalize">
          {review.riskLevel} risk
        </Badge>
      </div>

      {/* Reason */}
      {review.reason && (
        <div className="mb-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800/50">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Reason</p>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200">
            {review.reason}
          </p>
        </div>
      )}

      {/* Recommendation */}
      {review.recommendation && (
        <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Recommendation</p>
          <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-300">
            {review.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
