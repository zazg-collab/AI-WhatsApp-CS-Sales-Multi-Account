import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't' }));
const fakeSocket = { on: vi.fn(), off: vi.fn() };
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket }));

import HermesPage from './page';

describe('HermesPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders alerts and daily report', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/hermes/alerts')
        return Promise.resolve([
          { id: 'r1', conversationId: 'c1', decision: 'pause_ai', confidenceScore: 40, riskScore: 80, riskLevel: 'high', reason: 'legal', recommendation: 'review' },
        ]);
      if (path === '/hermes/reports/daily')
        return Promise.resolve({ date: '2026-06-01', totalMessages: 50, newCustomers: 5, hotLeads: 2, reviewsByDecision: { block: 1 } });
      return Promise.resolve(null);
    });
    render(<HermesPage />);
    expect(await screen.findByText('Pesan hari ini')).toBeInTheDocument();
    expect(await screen.findByText('legal')).toBeInTheDocument();
  });

  it('asks Hermes a question', async () => {
    apiMock.mockResolvedValueOnce([]).mockResolvedValueOnce(null);
    render(<HermesPage />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/hermes/alerts'));

    apiMock.mockResolvedValueOnce({ answer: 'Semua baik' });
    const input = screen.getByPlaceholderText(/.+/);
    await userEvent.type(input, 'Bagaimana performa?');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Semua baik')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/hermes/ask', expect.objectContaining({ method: 'POST' }));
  });
});
