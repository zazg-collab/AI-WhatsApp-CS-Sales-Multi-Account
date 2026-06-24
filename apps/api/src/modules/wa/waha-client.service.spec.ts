import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { WahaClientService } from './waha-client.service';

global.fetch = jest.fn();

describe('WahaClientService', () => {
  let svc: WahaClientService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WahaClientService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => ({ WAHA_API_URL: 'http://waha:3000', WAHA_API_KEY: 'test' }[k]) },
        },
      ],
    }).compile();
    svc = module.get(WahaClientService);
    jest.clearAllMocks();
  });

  it('createSession posts to /api/sessions', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await svc.createSession('acc1');
    expect(fetch).toHaveBeenCalledWith(
      'http://waha:3000/api/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sendText posts to /api/sendText', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'msg1' }) });
    const id = await svc.sendText('acc1', '628111@s.whatsapp.net', 'Hello');
    expect(id).toBe('msg1');
    expect(fetch).toHaveBeenCalledWith(
      'http://waha:3000/api/sendText',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws BadGatewayException on non-ok response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });
    await expect(svc.createSession('acc1')).rejects.toThrow(BadGatewayException);
  });

  it('getQr returns base64 string', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'data:image/png;base64,ABC' }),
    });
    const qr = await svc.getQr('acc1');
    expect(qr).toBe('data:image/png;base64,ABC');
  });

  it('getMe returns null on error without throwing', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });
    const result = await svc.getMe('acc1');
    expect(result).toBeNull();
  });

  it('setReaction calls PUT /api/reaction', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await svc.setReaction('acc1', 'msg123', '👍');
    expect(fetch).toHaveBeenCalledWith(
      'http://waha:3000/api/reaction',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
