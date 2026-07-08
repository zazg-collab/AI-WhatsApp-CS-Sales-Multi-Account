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
    apiMock.mockImplementation((path: string) =>
      path === '/settings' ? Promise.resolve(settings) : Promise.resolve([]),
    );
    render(<AiSettingsPage />);
    // baseUrl and model are editable inputs, not static text.
    expect(await screen.findByDisplayValue('http://x/v1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hermes-4-70B')).toBeInTheDocument();
  });

  it('auto-loads the model list and shows it in the model dropdown', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/settings') return Promise.resolve(settings);
      if (path === '/ai/models') return Promise.resolve(['model-a', 'model-b']);
      return Promise.resolve([]);
    });
    render(<AiSettingsPage />);
    const modelInput = await screen.findByDisplayValue('Hermes-4-70B');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/ai/models'));

    // The dropdown filters by the field's current text, so clear it first to
    // see the full loaded list rather than filtering against the old value.
    await userEvent.clear(modelInput);
    expect(await screen.findByText('model-a')).toBeInTheDocument();
    expect(screen.getByText('model-b')).toBeInTheDocument();
  });

  it('shows a message when model load fails', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/settings') return Promise.resolve(settings);
      if (path === '/ai/models') return Promise.reject(new Error('boom'));
      return Promise.resolve([]);
    });
    render(<AiSettingsPage />);
    await screen.findByDisplayValue('http://x/v1');
    await waitFor(() => expect(screen.getByText(/No models found/)).toBeInTheDocument());
  });
});
