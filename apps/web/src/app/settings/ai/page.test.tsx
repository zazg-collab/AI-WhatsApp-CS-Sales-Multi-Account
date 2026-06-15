import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  getToken: () => null,
  hasRole: () => true,
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import AiSettingsPage from './page';

// The page loads the layered settings object from /settings on mount.
const settings = {
  ai: { baseUrl: 'http://x/v1', model: 'Hermes-4-70B', temperature: 0.7, timeoutMs: 30000, apiKeySet: true },
  wa: { humanDelayMinMs: 0, humanDelayMaxMs: 0, typingPerCharMs: 0, typingMinMs: 0, typingMaxMs: 0 },
  notifications: { hermesNotifyTarget: '' },
  sla: { responseMinutes: 15 },
};

describe('AiSettingsPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders settings from /settings', async () => {
    apiMock.mockResolvedValueOnce(settings);
    render(<AiSettingsPage />);
    // baseUrl and model are editable inputs, not static text.
    expect(await screen.findByDisplayValue('http://x/v1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hermes-4-70B')).toBeInTheDocument();
  });

  it('loads models into the datalist on button click', async () => {
    apiMock.mockResolvedValueOnce(settings);
    const { container } = render(<AiSettingsPage />);
    await screen.findByDisplayValue('http://x/v1');

    apiMock.mockResolvedValueOnce(['model-a', 'model-b']);
    await userEvent.click(screen.getByRole('button', { name: /Muat daftar model/ }));
    await waitFor(() => expect(container.querySelector('option[value="model-a"]')).toBeTruthy());
    expect(container.querySelector('option[value="model-b"]')).toBeTruthy();
  });

  it('shows a message when model load fails', async () => {
    apiMock.mockResolvedValueOnce(settings);
    render(<AiSettingsPage />);
    await screen.findByDisplayValue('http://x/v1');

    apiMock.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: /Muat daftar model/ }));
    await waitFor(() => expect(screen.getByText(/Tidak ada model ditemukan/)).toBeInTheDocument());
  });
});
