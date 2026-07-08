import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
const hasRoleMock = vi.fn(() => true);
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  getToken: () => null,
  hasRole: (...a: any[]) => hasRoleMock(...a),
}));

const socketHandlers: Record<string, Function> = {};
const fakeSocket = {
  on: (evt: string, cb: Function) => {
    socketHandlers[evt] = cb;
  },
  off: vi.fn(),
};
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket }));

import AccountsPage from './page';

describe('AccountsPage', () => {
  beforeEach(() => {
    apiMock.mockReset();
    hasRoleMock.mockReset();
    hasRoleMock.mockReturnValue(true);
    fakeSocket.off.mockClear();
  });

  it('loads and renders accounts', async () => {
    apiMock.mockResolvedValueOnce([
      {
        id: '1',
        accountName: 'Sales Bot',
        phoneNumber: '628123',
        sessionStatus: 'connected',
      },
    ]);
    render(<AccountsPage />);

    expect(await screen.findByText('Sales Bot')).toBeInTheDocument();
    expect(screen.getByText('628123')).toBeInTheDocument();
    // Status is now translated via getStatusLabel() — check for the translated label, not raw status
    expect(screen.getByText(/Connected|Terhubung/)).toBeInTheDocument();
  });

  // The add flow is now scan-first: choosing QR creates a blank account
  // (POST {}), then name/number auto-fill from the device and are saved via
  // PATCH in the confirm step. This asserts the blank-create entry point.
  it('starts the scan-first add flow by creating a blank account', async () => {
    apiMock.mockResolvedValueOnce([]); // initial load
    render(<AccountsPage />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/wa/accounts'));

    apiMock.mockResolvedValueOnce({ id: 'new1' }); // POST {} (scan-first blank create)

    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await userEvent.click(await screen.findByText('Scan QR code'));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/wa/accounts', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    });
  });

  it('shows an error when loading fails', async () => {
    apiMock.mockRejectedValueOnce(new Error('Gagal memuat'));
    render(<AccountsPage />);
    expect(await screen.findByText('Gagal memuat')).toBeInTheDocument();
  });

  it('renders a QR image when a wa:qr event arrives for a qr_required account', async () => {
    apiMock.mockResolvedValueOnce([
      {
        id: '1',
        accountName: 'Pending',
        phoneNumber: '628',
        sessionStatus: 'qr_required',
      },
    ]);
    render(<AccountsPage />);
    await screen.findByText('Pending');

    socketHandlers['wa:qr']({ accountId: '1', qr: 'data:image/png;base64,xx' });

    const img = await screen.findByAltText('WhatsApp QR code');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,xx');
  });
});
