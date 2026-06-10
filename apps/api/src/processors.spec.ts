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
  it('emits through socket server when present', () => {
    const g = new EventsGateway({} as any, { get: () => 'secret' } as any);
    g.server = { emit: jest.fn() } as any;
    g.emit('wa:status', { a: 1 });
    expect(g.server.emit).toHaveBeenCalledWith('wa:status', { a: 1 });
  });
  it('no-ops when server undefined', () => {
    const g = new EventsGateway({} as any, { get: () => 'secret' } as any);
    expect(() => g.emit('x', {})).not.toThrow();
  });
});
