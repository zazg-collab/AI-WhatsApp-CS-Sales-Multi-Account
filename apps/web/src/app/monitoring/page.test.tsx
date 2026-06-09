import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't' }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import MonitoringPage from './page';

const data = {
  rangeDays: 7,
  totals: { messages: 100, conversations: 20, customers: 15 },
  response: { avgSeconds: 75, p95Seconds: 130, sampleSize: 50 },
  aiQuality: { reviewCount: 10, avgConfidence: 88, avgRisk: 12, fallbackCount: 1, fallbackRate: 0.1, decisions: { approve: 8 }, riskLevels: { low: 9 } },
  campaign: { campaignCount: 1, totalRecipients: 10, sent: 9, failed: 1, successRate: 0.9, failureRate: 0.1, byStatus: { completed: 1 }, recentCampaigns: [] },
  messageVolume: [{ date: '2026-06-01', count: 5 }],
  topAccounts: [{ id: 'a1', name: 'Sales', messageCount: 5 }],
};

describe('MonitoringPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders performance metrics', async () => {
    apiMock.mockResolvedValue(data);
    render(<MonitoringPage />);
    expect(await screen.findByText('Performance Monitoring')).toBeInTheDocument();
    expect(await screen.findByText('Messages')).toBeInTheDocument();
  });

  it('shows error on failure', async () => {
    apiMock.mockImplementationOnce(() => Promise.reject(new Error('metrics down')));
    apiMock.mockResolvedValue(data);
    render(<MonitoringPage />);
    expect(await screen.findByText('metrics down')).toBeInTheDocument();
  });

  it('reloads when range changes', async () => {
    apiMock.mockResolvedValue(data);
    render(<MonitoringPage />);
    await screen.findByText('Performance Monitoring');
    await userEvent.selectOptions(screen.getByRole('combobox'), '30');
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('days=30'));
  });
});
