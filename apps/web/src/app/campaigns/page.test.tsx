import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

function jwt(r: string) {
  return `h.${btoa(JSON.stringify({ role: r }))}.s`;
}

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => jwt('owner') }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import CampaignsPage from './page';

describe('CampaignsPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders campaigns and accounts', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/campaigns')
        return Promise.resolve([
          { id: 'cp1', name: 'Promo Juni', messageTemplate: 'Halo', status: 'draft', rateLimitPerMinute: 10, createdAt: '2026-06-01T00:00:00.000Z' },
        ]);
      if (path === '/wa/accounts')
        return Promise.resolve([{ id: 'a1', accountName: 'Sales', phoneNumber: '628' }]);
      return Promise.resolve({});
    });
    render(<CampaignsPage />);
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Promo Juni')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('renders the create form fields', async () => {
    apiMock.mockResolvedValue([]);
    render(<CampaignsPage />);
    expect(await screen.findByPlaceholderText('Campaign name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Campaign message/)).toBeInTheDocument();
  });
});
