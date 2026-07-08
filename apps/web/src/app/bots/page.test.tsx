import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't' }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import BotsPage from './page';

describe('BotsPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders bots from the api', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/bots')
        return Promise.resolve([{ id: 'b1', botName: 'Sales Bot', isActive: true, language: 'id', accounts: [], defaultAiMode: 'ai_on' }]);
      if (path === '/bots/personas/list')
        return Promise.resolve([{ id: 'p1', name: 'Ceria' }]);
      if (path === '/knowledge-bases') return Promise.resolve({ items: [] });
      if (path === '/wa/accounts') return Promise.resolve([]);
      return Promise.resolve({});
    });
    render(<BotsPage />);
    expect(await screen.findByRole('heading', { name: 'Automation Mode' })).toBeInTheDocument();
    expect(await screen.findByText('Sales Bot')).toBeInTheDocument();
  });

  it('shows error on load failure', async () => {
    apiMock.mockImplementation((path: string = '') =>
      path === '/bots' ? Promise.reject(new Error('Gagal memuat data')) : Promise.resolve([]),
    );
    render(<BotsPage />);
    expect(await screen.findByText('Gagal memuat data')).toBeInTheDocument();
  });
});
