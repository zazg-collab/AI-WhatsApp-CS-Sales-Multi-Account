jest.mock('./modules/wa/wa.service', () => ({ WaService: class {} }));

import { FollowUpsProcessor } from './modules/followups/followups.processor';
import { CampaignsProcessor } from './modules/campaigns/campaigns.processor';
import { EventsGateway } from './realtime/events.gateway';

describe('FollowUpsProcessor', () => {
  it('processes send-followup jobs', async () => {
    const svc: any = { processJob: jest.fn().mockResolvedValue(undefined) };
    const p = new FollowUpsProcessor(svc);
    await p.process({ name: 'send-followup', data: { followUpId: 'f1' } } as any);
    expect(svc.processJob).toHaveBeenCalledWith('f1');
  });
  it('ignores other jobs', async () => {
    const svc: any = { processJob: jest.fn() };
    await new FollowUpsProcessor(svc).process({ name: 'other', data: {} } as any);
    expect(svc.processJob).not.toHaveBeenCalled();
  });
});

describe('CampaignsProcessor', () => {
  it('processes send-recipient jobs', async () => {
    const svc: any = { processRecipient: jest.fn().mockResolvedValue(undefined) };
    await new CampaignsProcessor(svc).process({ name: 'send-recipient', data: { recipientId: 'r1' } } as any);
    expect(svc.processRecipient).toHaveBeenCalledWith('r1');
  });
  it('ignores other jobs', async () => {
    const svc: any = { processRecipient: jest.fn() };
    await new CampaignsProcessor(svc).process({ name: 'x', data: {} } as any);
    expect(svc.processRecipient).not.toHaveBeenCalled();
  });
});

describe('EventsGateway', () => {
  const makeGateway = () =>
    new EventsGateway({} as any, { get: () => 'secret' } as any, {} as any);
  const makeServer = () => {
    const emit = jest.fn();
    const rooms: string[] = [];
    const chain = { to: jest.fn(), emit };
    chain.to.mockImplementation((room: string) => {
      rooms.push(room);
      return chain;
    });
    return { server: chain as any, emit, rooms };
  };

  it('scopes account events to the account room + all-accounts room', () => {
    const g = makeGateway();
    const { server, emit, rooms } = makeServer();
    g.server = server;
    g.emitToAccount('a1', 'wa:status', { a: 1 });
    expect(rooms).toEqual(['account:a1', 'accounts:all']);
    expect(emit).toHaveBeenCalledWith('wa:status', { a: 1 });
  });
  it('global events reach only the all-accounts room', () => {
    const g = makeGateway();
    const { server, rooms } = makeServer();
    g.server = server;
    g.emit('x', {});
    expect(rooms).toEqual(['accounts:all']);
  });
  it('no-ops when server undefined', () => {
    const g = makeGateway();
    expect(() => g.emit('x', {})).not.toThrow();
    expect(() => g.emitToAccount('a1', 'x', {})).not.toThrow();
  });
});
