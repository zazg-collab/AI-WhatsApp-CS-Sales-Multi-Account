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
    expect(await screen.findByText('login')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('renders gracefully with no data', async () => {
    apiMock.mockResolvedValue({ data: [], total: 0 });
    render(<AuditPage />);
    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
  });
});
