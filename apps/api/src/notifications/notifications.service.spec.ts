import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function make(env: Record<string, string> = {}) {
    const settings = {
      notifications: async () => ({ hermesNotifyTarget: env.HERMES_NOTIFY_TARGET ?? '' }),
    } as any;
    const metrics = { notificationSend: { inc: () => undefined } } as any;
    return new NotificationsService({ get: (k: string) => env[k] } as any, settings, metrics);
  }

  it('disabled when no target', () => {
    expect(make().enabled).toBe(false);
  });

  it('enabled when target set', () => {
    expect(make({ HERMES_NOTIFY_TARGET: 'telegram' }).enabled).toBe(true);
  });

  it('send no-ops when no target', async () => {
    await expect(make().send('hi')).resolves.toBeUndefined();
  });

  it('send resolves even when CLI errors (fire-and-forget)', async () => {
    const svc = make({ HERMES_NOTIFY_TARGET: 'telegram', HERMES_BIN: 'definitely-not-a-real-binary-xyz' });
    await expect(svc.send('hello')).resolves.toBeUndefined();
  });
});
