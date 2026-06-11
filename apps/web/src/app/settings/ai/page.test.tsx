import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  getToken: () => null,
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import AiSettingsPage from './page';

describe('AiSettingsPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders config from /ai/config', async () => {
    apiMock.mockResolvedValueOnce({ baseUrl: 'http://x/v1', defaultModel: 'Hermes-4-70B' });
    render(<AiSettingsPage />);
    expect(await screen.findByText('http://x/v1')).toBeInTheDocument();
    expect(screen.getByText('Hermes-4-70B')).toBeInTheDocument();
  });

  it('loads models on button click', async () => {
    apiMock.mockResolvedValueOnce({ baseUrl: 'b', defaultModel: 'm' });
    render(<AiSettingsPage />);
    await screen.findByText('b');

    apiMock.mockResolvedValueOnce(['model-a', 'model-b']);
    await userEvent.click(screen.getByRole('button', { name: /Muat model/ }));
    expect(await screen.findByText('model-a')).toBeInTheDocument();
    expect(screen.getByText('model-b')).toBeInTheDocument();
  });

  it('shows error when model load fails', async () => {
    apiMock.mockResolvedValueOnce({ baseUrl: 'b', defaultModel: 'm' });
    render(<AiSettingsPage />);
    await screen.findByText('b');

    apiMock.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: /Muat model/ }));
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});
