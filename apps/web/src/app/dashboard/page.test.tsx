import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  uploadFile: vi.fn(),
  getToken: () => 't',
  getUserId: () => 'u1',
  resolveMediaUrl: (u: string | null) =>
    u && (u.startsWith('/media/') || u.startsWith('http')) ? u : null,
}));
const handlers: Record<string, Function> = {};
const fakeSocket = {
  on: (e: string, cb: Function) => { handlers[e] = cb; },
  off: vi.fn(),
};
vi.mock('@/lib/socket', () => ({ getSocket: () => fakeSocket }));

import DashboardPage from './page';

const convList = {
  items: [
    { id: 'c1', customer: { id: 'cu1', name: 'Andi', phoneNumber: '628111' }, whatsappAccount: { id: 'a1', accountName: 'Sales Bot', phoneNumber: '628000' }, aiMode: 'ai_on', lastMessageAt: '2026-06-01T00:00:00.000Z', unreadCount: 0, status: 'open', messages: [{ id: 'm0', senderType: 'customer', content: 'Halo', createdAt: '2026-06-01T00:00:00.000Z' }] },
  ],
};

const accounts = [
  { id: 'a1', accountName: 'Sales Bot', phoneNumber: '628000' },
];

const convDetail = {
  id: 'c1',
  aiMode: 'ai_on',
  status: 'open',
  customer: { id: 'cu1', name: 'Andi', phoneNumber: '628111', leadScore: 50, leadStage: 'warm', tags: [], notes: '' },
  whatsappAccount: { id: 'a1', accountName: 'Sales Bot', phoneNumber: '628000' },
  hermesReviews: [],
  messages: [
    { id: 'm1', senderType: 'customer', content: 'Pesan detail unik', createdAt: '2026-06-01T00:00:00.000Z' },
  ],
};

// jsdom does not implement scrollIntoView
(Element.prototype as any).scrollIntoView = vi.fn();

describe('DashboardPage', () => {
  beforeEach(() => apiMock.mockReset());

  it('renders conversation list', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      if (path.startsWith('/conversations?')) return Promise.resolve(convList);
      return Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Percakapan')).toBeInTheDocument();
    expect(await screen.findByText('Andi')).toBeInTheDocument();
  });

  it('opens a conversation when clicked', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      if (path.startsWith('/conversations?')) return Promise.resolve(convList);
      if (path === '/conversations/c1') return Promise.resolve(convDetail);
      if (path.startsWith('/follow-ups')) return Promise.resolve([]);
      return Promise.resolve({});
    });
    render(<DashboardPage />);
    await userEvent.click(await screen.findByText('Andi'));
    expect(await screen.findByText('Pesan detail unik')).toBeInTheDocument();
  });

  it('filters by workflow status', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      return path.startsWith('/conversations?') ? Promise.resolve(convList) : Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    await screen.findByText('Percakapan');
    await userEvent.selectOptions(screen.getByTitle('Filter status percakapan'), 'pending');
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('status=pending')),
    );
  });

  it('shows the status badge on a conversation row', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      return path.startsWith('/conversations?') ? Promise.resolve(convList) : Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Open')).toBeInTheDocument();
  });

  it('shows an SLA badge for an overdue conversation', async () => {
    const breached = {
      items: [{ ...convList.items[0], slaBreachedAt: '2026-06-01T00:00:00.000Z' }],
    };
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      return path.startsWith('/conversations?') ? Promise.resolve(breached) : Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    expect(await screen.findByText('⏰ SLA')).toBeInTheDocument();
  });

  it('filters by label', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      return path.startsWith('/conversations?') ? Promise.resolve(convList) : Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    await screen.findByText('Percakapan');
    await userEvent.type(screen.getByPlaceholderText('Filter label (mis. refund)'), 'refund');
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('label=refund')),
    );
  });

  it('filters by search input', async () => {
    apiMock.mockImplementation((path: string = '') => {
      if (path === '/wa/accounts') return Promise.resolve(accounts);
      return path.startsWith('/conversations?') ? Promise.resolve(convList) : Promise.resolve(convDetail);
    });
    render(<DashboardPage />);
    await screen.findByText('Percakapan');
    await userEvent.type(screen.getByPlaceholderText('Cari nama / nomor...'), 'Andi');
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('search=Andi')),
    );
  });
});
