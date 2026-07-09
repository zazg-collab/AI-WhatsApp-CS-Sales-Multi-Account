import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let role = 'owner';
function jwt(r: string) {
  return `h.${btoa(JSON.stringify({ role: r }))}.s`;
}

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  getToken: () => jwt(role),
  resolveMediaUrl: (u?: string | null) => u ?? null,
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import UsersPage from './page';

describe('UsersPage', () => {
  beforeEach(() => {
    apiMock.mockReset();
    role = 'owner';
  });

  it('renders users for an owner', async () => {
    apiMock.mockResolvedValue({
      users: [{ id: 'u1', name: 'Owner', email: 'o@x.com', role: 'owner' }],
    });
    render(<UsersPage />);
    expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
    // Name renders in both the desktop table and the mobile card layout.
    expect((await screen.findAllByText('Owner')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Create user/ })).toBeInTheDocument();
  });

  it('blocks unauthorized roles', async () => {
    role = 'viewer';
    apiMock.mockResolvedValue({ users: [] });
    render(<UsersPage />);
    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument();
  });
});
