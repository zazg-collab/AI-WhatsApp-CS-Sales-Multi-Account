import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't' }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import AnalyticsPage from './page';

const summary = {
  totalConversations: 10,
  activeConversations: 4,
  aiOnConversations: 3,
  pendingFollowUps: 2,
  leadsToday: { hot: 1, warm: 2, cold: 3 },
  messagesLast24h: 42,
  avgResponseTime: 12,
  topAccounts: [{ id: 'a1', name: 'Sales', messageCount: 5 }],
};

describe('AnalyticsPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders summary data', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/dashboard/summary') return Promise.resolve(summary);
      if (path === '/dashboard/lead-funnel') return Promise.resolve([{ stage: 'hot', count: 5 }]);
      if (path.startsWith('/dashboard/message-volume')) return Promise.resolve([{ date: '2026-06-01', count: 7 }]);
      if (path === '/dashboard/ai-mode-breakdown') return Promise.resolve([{ mode: 'ai_on', count: 3, percentage: 50 }]);
      return Promise.resolve([]);
    });
    render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(await screen.findByText('Sales')).toBeInTheDocument();
  });

  it('renders even when api fails', async () => {
    apiMock.mockImplementation((path: string = '') =>
      path === '/dashboard/summary' ? Promise.reject(new Error('nope')) : Promise.resolve([]),
    );
    render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
  });
});
