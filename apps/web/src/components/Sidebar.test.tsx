import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import { setPathname, pushMock } from '../../vitest.setup';

function makeToken(role: string): string {
  const payload = btoa(JSON.stringify({ role }));
  return `header.${payload}.sig`;
}

describe('Sidebar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setPathname('/dashboard');
  });

  it('renders the always-visible nav links', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides role-restricted links when no token (no role)', () => {
    render(<Sidebar />);
    // requiredRole admin/supervisor links hidden
    expect(screen.queryByText('Campaigns')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
  });

  it('shows admin-level links for an admin but not supervisor-only links', () => {
    window.localStorage.setItem('hermes_token', makeToken('admin'));
    render(<Sidebar />);
    expect(screen.getByText('Campaigns')).toBeInTheDocument(); // admin
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument(); // supervisor
  });

  it('shows all restricted links for an owner', () => {
    window.localStorage.setItem('hermes_token', makeToken('owner'));
    render(<Sidebar />);
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('marks the active link based on pathname', () => {
    setPathname('/accounts');
    render(<Sidebar />);
    const active = screen.getByText('Accounts').closest('a');
    expect(active?.className).toContain('bg-emerald-600');
    const inactive = screen.getByText('Dashboard').closest('a');
    expect(inactive?.className).not.toContain('bg-emerald-600');
  });

  it('logs out and navigates home', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByTitle('Logout'));
    expect(pushMock).toHaveBeenCalledWith('/');
  });

  it('treats a malformed token as no role', () => {
    window.localStorage.setItem('hermes_token', 'not-a-jwt');
    render(<Sidebar />);
    expect(screen.queryByText('Campaigns')).not.toBeInTheDocument();
  });
});
