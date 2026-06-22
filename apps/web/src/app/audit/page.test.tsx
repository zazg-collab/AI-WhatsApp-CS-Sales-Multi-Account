import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: any[]) => apiMock(...a), getToken: () => 't' }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import AuditPage from './page';

describe('AuditPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders audit entries', async () => {
    apiMock.mockResolvedValue({
      data: [
        {
          id: 'e1',
          action: 'login',
          entityType: 'user',
          entityId: 'u1',
          oldValue: null,
          newValue: { ip: '1.2.3.4' },
          createdAt: '2026-06-01T00:00:00.000Z',
          user: { id: 'u1', name: 'Owner', email: 'o@x.com' },
        },
      ],
      total: 1,
    });
    render(<AuditPage />);
    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
    // Entries render in both the desktop table and the mobile card layout.
    expect((await screen.findAllByText('login')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
  });

  it('renders gracefully with no data', async () => {
    apiMock.mockResolvedValue({ data: [], total: 0 });
    render(<AuditPage />);
    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
  });
});
