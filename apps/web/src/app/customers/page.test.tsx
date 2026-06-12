import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

function jwt(role: string) {
  const body = btoa(JSON.stringify({ role }));
  return `h.${body}.s`;
}

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => jwt('owner') }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import CustomersPage from './page';

describe('CustomersPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders customers from the api', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path.startsWith('/customers')) {
        return Promise.resolve([
          { id: 'cu1', name: 'Budi', phoneNumber: '628222', leadScore: 70, leadStage: 'hot', tags: ['vip'], notes: '' },
        ]);
      }
      if (path.startsWith('/users')) return Promise.resolve({ users: [] });
      return Promise.resolve({});
    });
    render(<CustomersPage />);
    expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(await screen.findByText('Budi')).toBeInTheDocument();
  });

  it('renders the search box', async () => {
    apiMock.mockImplementation((path: string = '') =>
      path.startsWith('/users') ? Promise.resolve({ users: [] }) : Promise.resolve([]),
    );
    render(<CustomersPage />);
    expect(await screen.findByPlaceholderText('Cari nama / nomor...')).toBeInTheDocument();
  });
});
