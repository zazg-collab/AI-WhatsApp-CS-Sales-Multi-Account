import { WaSessionStore } from './wa-session.store';

describe('WaSessionStore history sync generation', () => {
  it('a stale generation does not override a newer in-progress sync', () => {
    const store = new WaSessionStore();
    const accountId = 'acc1';

    const gen1 = store.startHistorySync(accountId);
    const gen2 = store.startHistorySync(accountId); // reconnect before gen1's fallback timer fires

    expect(store.isCurrentHistorySyncGeneration(accountId, gen1)).toBe(false);
    expect(store.isCurrentHistorySyncGeneration(accountId, gen2)).toBe(true);
  });

  it('the current generation can still mark itself completed', () => {
    const store = new WaSessionStore();
    const accountId = 'acc1';

    const gen = store.startHistorySync(accountId);
    expect(store.isCurrentHistorySyncGeneration(accountId, gen)).toBe(true);

    const completed = store.addHistorySyncBatch(accountId, 0, 0, true);
    expect(completed.status).toBe('completed');
  });
});
