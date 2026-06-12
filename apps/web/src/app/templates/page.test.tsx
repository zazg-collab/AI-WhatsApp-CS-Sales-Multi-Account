import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't', getRole: () => 'owner', hasRole: () => true }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import TemplatesPage from './page';

const templates = [
  { id: 'q1', title: 'Salam', content: 'Halo kak', shortcut: 'salam', whatsappAccountId: null, whatsappAccount: null },
];
const accounts = [{ id: 'a1', accountName: 'Sales', phoneNumber: '628' }];

function routed(path?: string, opts?: any) {
  if ((path ?? '').startsWith('/quick-replies') && (!opts || opts.method === undefined)) return Promise.resolve(templates);
  if ((path ?? '').startsWith('/wa/accounts')) return Promise.resolve(accounts);
  return Promise.resolve({});
}

describe('TemplatesPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('lists existing templates', async () => {
    apiMock.mockImplementation(routed);
    render(<TemplatesPage />);
    expect(await screen.findByText('Salam')).toBeInTheDocument();
    expect(await screen.findByText('/salam')).toBeInTheDocument();
  });

  it('creates a template via the form', async () => {
    apiMock.mockImplementation(routed);
    render(<TemplatesPage />);
    await screen.findByText('Salam');
    await userEvent.type(screen.getByPlaceholderText('mis. Salam pembuka'), 'Tutup');
    await userEvent.type(screen.getByPlaceholderText('Halo kak, terima kasih sudah menghubungi kami…'), 'Terima kasih kak');
    await userEvent.click(screen.getByText('Tambah'));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/quick-replies', expect.objectContaining({ method: 'POST' })),
    );
  });
});
