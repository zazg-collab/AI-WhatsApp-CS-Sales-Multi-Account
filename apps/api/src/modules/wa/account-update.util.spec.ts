import { buildAccountUpdateData } from './account-update.util';

/**
 * Guards the explicit field allowlist used by WaService.updateAccount. The PATCH
 * controller used to spread the DTO straight into prisma.update; this maps only
 * known, client-editable columns so a stray property can never be persisted.
 */
describe('buildAccountUpdateData', () => {
  it('maps only defined, allowlisted fields', () => {
    const data = buildAccountUpdateData({ accountName: 'Toko', awayMessage: 'BRB' } as any);
    expect(data).toEqual({ accountName: 'Toko', awayMessage: 'BRB' });
  });

  it('translates bot/admin foreign keys into connect/disconnect', () => {
    const data = buildAccountUpdateData({ assignedBotId: 'bot1', assignedAdminId: null } as any);
    expect(data.assignedBot).toEqual({ connect: { id: 'bot1' } });
    expect(data.assignedAdmin).toEqual({ disconnect: true });
  });

  it('drops properties not on the allowlist', () => {
    const data = buildAccountUpdateData({ accountName: 'X', hacker: 'rm -rf', sessionStatus: 'banned' } as any);
    expect(data).toEqual({ accountName: 'X' });
    expect(data).not.toHaveProperty('hacker');
    expect(data).not.toHaveProperty('sessionStatus');
  });

  it('returns an empty payload when nothing is provided', () => {
    expect(buildAccountUpdateData({} as any)).toEqual({});
  });
});
