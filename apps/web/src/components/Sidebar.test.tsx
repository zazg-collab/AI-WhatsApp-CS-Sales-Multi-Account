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
    setPathname('/overview');
  });

  it('renders the always-visible nav links', () => {
    render(<Sidebar />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides role-restricted links when no token (no role)', () => {
    render(<Sidebar />);
    expect(screen.queryByText('Campaigns')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
  });

  it('shows admin-level links for an admin but not supervisor-only links', () => {
    window.localStorage.setItem('sentinel_token', makeToken('admin'));
    render(<Sidebar />);
    expect(screen.getByText('Campaigns')).toBeInTheDocument(); // admin
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument(); // supervisor
  });

  it('shows all restricted links for an owner', () => {
    window.localStorage.setItem('sentinel_token', makeToken('owner'));
    render(<Sidebar />);
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('marks the active link based on pathname', () => {
    setPathname('/customers');
    render(<Sidebar />);
    const active = screen.getByText('Contacts').closest('a');
    expect(active?.className).toContain('bg-sentinel-50');
    const inactive = screen.getByText('Overview').closest('a');
    expect(inactive?.className).not.toContain('bg-sentinel-50');
  });

  it('logs out and navigates to the login page', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByTitle('Sign out'));
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('treats a malformed token as no role', () => {
    window.localStorage.setItem('sentinel_token', 'not-a-jwt');
    render(<Sidebar />);
    expect(screen.queryByText('Campaigns')).not.toBeInTheDocument();
  });
});
