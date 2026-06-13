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
  csat: { responses: 4, requested: 8, responseRate: 50, avgScore: 4.5, distribution: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 3 } },
};

const workload = {
  rangeDays: 7,
  admins: [
    { id: 'u1', name: 'Ani', role: 'admin', assigned: 3, resolved: 2, messagesSent: 40, avgResponseSeconds: 90, responseSamples: 10 },
  ],
};

// Route the mock by path so performance and workload return their own shapes.
function routed(path?: string) {
  if ((path ?? '').includes('admin-workload')) return Promise.resolve(workload);
  return Promise.resolve(data);
}

describe('MonitoringPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders performance metrics', async () => {
    apiMock.mockImplementation(routed);
    render(<MonitoringPage />);
    expect(await screen.findByText('Performance Monitoring')).toBeInTheDocument();
    expect(await screen.findByText('Messages')).toBeInTheDocument();
  });

  it('renders the admin workload report', async () => {
    apiMock.mockImplementation(routed);
    render(<MonitoringPage />);
    expect(await screen.findByText(/Admin workload/)).toBeInTheDocument();
    expect(await screen.findByText('Ani')).toBeInTheDocument();
  });

  it('renders the CSAT card', async () => {
    apiMock.mockImplementation(routed);
    render(<MonitoringPage />);
    expect(await screen.findByText('Customer satisfaction (CSAT)')).toBeInTheDocument();
    expect(await screen.findByText('4.5 / 5')).toBeInTheDocument();
  });

  it('shows error on failure', async () => {
    apiMock.mockImplementation((path?: string) => {
      if ((path ?? '').includes('performance')) return Promise.reject(new Error('metrics down'));
      return routed(path);
    });
    render(<MonitoringPage />);
    expect(await screen.findByText('metrics down')).toBeInTheDocument();
  });

  it('reloads when range changes', async () => {
    apiMock.mockImplementation(routed);
    render(<MonitoringPage />);
    await screen.findByText('Performance Monitoring');
    await userEvent.selectOptions(screen.getByRole('combobox'), '30');
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('days=30'));
  });
});
