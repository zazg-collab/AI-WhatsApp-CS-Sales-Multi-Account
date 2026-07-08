import { WaService } from './wa.service';

/**
 * Guards the explicit field allowlist in WaService.updateAccount. The PATCH
 * controller used to spread the DTO straight into prisma.update; this maps only
 * known, client-editable columns so a stray property can never be persisted.
 */
describe('WaService.updateAccount', () => {
  let prisma: any;
  let service: WaService;

  beforeEach(() => {
    prisma = {
      whatsappAccount: { update: jest.fn().mockResolvedValue({ id: 'a1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const config = { get: jest.fn().mockReturnValue(undefined) } as any;
    service = new WaService(
      null as any, // store
      null as any, // gateway
      prisma,      // prisma
      null as any, // events
      null as any, // notifications
      null as any, // storage
      null as any, // contactSync
      null as any, // waInbound
      null as any, // waMirror
      null as any, // learning
      config,      // config
    );
  });

  it('maps only defined, allowlisted fields into the update', async () => {
    await service.updateAccount('a1', { accountName: 'Toko', awayMessage: 'BRB' } as any, 'u1');

    expect(prisma.whatsappAccount.update).toHaveBeenCalledTimes(1);
    const arg = prisma.whatsappAccount.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'a1' });
    // Only the two provided fields are present; nothing else leaks in.
    expect(arg.data).toEqual({ accountName: 'Toko', awayMessage: 'BRB' });
  });

  it('translates bot/admin foreign keys into connect/disconnect, and drops unknown props', async () => {
    await service.updateAccount(
      'a1',
      { assignedBotId: 'bot1', assignedAdminId: null, hacker: 'rm -rf' } as any,
      'u1',
    );

    const { data } = prisma.whatsappAccount.update.mock.calls[0][0];
    expect(data.assignedBot).toEqual({ connect: { id: 'bot1' } });
    expect(data.assignedAdmin).toEqual({ disconnect: true });
    // A property not on the allowlist is never forwarded to Prisma.
    expect(data).not.toHaveProperty('hacker');
  });

  it('writes an audit record for the update', async () => {
    await service.updateAccount('a1', { isActive: false } as any, 'u1');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      action: 'account_update',
      entityId: 'a1',
    });
  });
});
