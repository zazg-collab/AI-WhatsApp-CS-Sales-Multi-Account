import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SentinelReviewCard } from './SentinelReviewCard';
import type { ConvDetail, SentinelReview } from '../inbox.types';

function makeConversation(reviews: SentinelReview[]): ConvDetail {
  return {
    id: 'c1',
    aiMode: 'ai_supervised',
    takeoverStatus: 'none',
    status: 'open',
    customer: {
      id: 'cu1', name: 'Budi', phoneNumber: '628123', leadScore: 0,
      leadStage: 'cold', tags: [], notes: null,
    },
    whatsappAccount: { id: 'a1', accountName: 'Acc', phoneNumber: '628999' } as ConvDetail['whatsappAccount'],
    bot: null,
    messages: [],
    sentinelReviews: reviews,
  } as ConvDetail;
}

function makeReview(overrides: Partial<SentinelReview> = {}): SentinelReview {
  return {
    id: 'r1',
    decision: 'draft',
    confidenceScore: 72,
    riskScore: 20,
    riskLevel: 'low',
    reason: null,
    recommendation: null,
    ...overrides,
  };
}

describe('SentinelReviewCard', () => {
  it('shows an empty-state message when there is no review yet', () => {
    render(<SentinelReviewCard conversation={makeConversation([])} />);
    expect(screen.getByText(/no sentinel review/i)).toBeInTheDocument();
  });

  it('renders the confidence and risk scores from the most recent review', () => {
    render(<SentinelReviewCard conversation={makeConversation([makeReview({ confidenceScore: 88, riskScore: 15 })])} />);
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('renders the decision and risk level badges', () => {
    render(
      <SentinelReviewCard
        conversation={makeConversation([makeReview({ decision: 'takeover_required', riskLevel: 'critical' })])}
      />,
    );
    expect(screen.getByText(/takeover required/i)).toBeInTheDocument();
    expect(screen.getByText(/critical risk/i)).toBeInTheDocument();
  });

  it('renders the reason and recommendation when present', () => {
    render(
      <SentinelReviewCard
        conversation={makeConversation([
          makeReview({ reason: 'Klaim harga tidak sesuai knowledge base', recommendation: 'Ajukan ke admin' }),
        ])}
      />,
    );
    expect(screen.getByText('Klaim harga tidak sesuai knowledge base')).toBeInTheDocument();
    expect(screen.getByText('Ajukan ke admin')).toBeInTheDocument();
  });

  it('omits the reason/recommendation blocks when absent', () => {
    render(<SentinelReviewCard conversation={makeConversation([makeReview({ reason: null, recommendation: null })])} />);
    expect(screen.queryByText('Reason')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommendation')).not.toBeInTheDocument();
  });

  it('uses the most recent review when multiple exist', () => {
    render(
      <SentinelReviewCard
        conversation={makeConversation([
          makeReview({ id: 'latest', confidenceScore: 99 }),
          makeReview({ id: 'older', confidenceScore: 10 }),
        ])}
      />,
    );
    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.queryByText('10%')).not.toBeInTheDocument();
  });
});
