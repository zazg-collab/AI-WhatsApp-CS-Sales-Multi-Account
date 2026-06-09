import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => null }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import KnowledgePage from './page';

describe('KnowledgePage', () => {
  beforeEach(() => apiMock.mockReset());

  it('lists knowledge bases', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/knowledge-bases') return Promise.resolve([{ id: 'b1', name: 'Produk', status: 'active', _count: { items: 3 } }]);
      return Promise.resolve({ items: [] });
    });
    render(<KnowledgePage />);
    expect(await screen.findByText('Produk')).toBeInTheDocument();
  });

  it('selects a base and shows its items', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/knowledge-bases') return Promise.resolve([{ id: 'b1', name: 'Produk', status: 'active' }]);
      if (path === '/knowledge-bases/b1') return Promise.resolve({ items: [{ id: 'i1', title: 'Harga', content: 'Rp10rb', status: 'active' }] });
      return Promise.resolve({});
    });
    render(<KnowledgePage />);
    await userEvent.click(await screen.findByText('Produk'));
    expect(await screen.findByText('Harga')).toBeInTheDocument();
  });

  it('creates a new base', async () => {
    apiMock.mockImplementation((path: string = '') =>
      path === '/knowledge-bases' ? Promise.resolve([]) : Promise.resolve({}),
    );
    render(<KnowledgePage />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/knowledge-bases'));
    const input = screen.getByPlaceholderText(/[Nn]ama/);
    await userEvent.type(input, 'KB Baru');
    await userEvent.click(screen.getByRole('button', { name: /[Tt]ambah|[Bb]uat/ }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/knowledge-bases', expect.objectContaining({ method: 'POST' })),
    );
  });
});
