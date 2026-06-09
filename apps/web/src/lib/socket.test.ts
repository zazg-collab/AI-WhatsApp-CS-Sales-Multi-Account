import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioMock = vi.fn(() => ({ id: 'sock' }));
vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => ioMock(...args),
}));

describe('getSocket', () => {
  beforeEach(() => {
    vi.resetModules();
    ioMock.mockClear();
  });

  it('connects to the /events namespace with the stripped base url', async () => {
    const { getSocket } = await import('./socket');
    getSocket();
    expect(ioMock).toHaveBeenCalledWith('http://localhost:3001/events', {
      transports: ['websocket'],
    });
  });

  it('returns a singleton (io called once)', async () => {
    const { getSocket } = await import('./socket');
    const a = getSocket();
    const b = getSocket();
    expect(a).toBe(b);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });
});
