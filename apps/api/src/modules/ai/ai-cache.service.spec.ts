import { AiCacheService } from './ai-cache.service';

describe('AiCacheService', () => {
  let cache: AiCacheService;

  beforeEach(() => {
    cache = new AiCacheService();
  });

  it('returns null on miss and the answer on hit', () => {
    expect(cache.get('bot1', 'apa harga paket A')).toBeNull();
    cache.set('bot1', 'apa harga paket A', 'Rp100rb');
    expect(cache.get('bot1', 'apa harga paket A')).toBe('Rp100rb');
  });

  it('normalizes casing, whitespace and trailing punctuation to one key', () => {
    cache.set('bot1', 'Apa harga Paket A', 'Rp100rb');
    expect(cache.get('bot1', '  apa   harga paket a???  ')).toBe('Rp100rb');
    expect(cache.get('bot1', 'APA HARGA PAKET A.')).toBe('Rp100rb');
  });

  it('keys by bot — different bots do not collide', () => {
    cache.set('bot1', 'q', 'a1');
    cache.set('bot2', 'q', 'a2');
    expect(cache.get('bot1', 'q')).toBe('a1');
    expect(cache.get('bot2', 'q')).toBe('a2');
  });

  it('expires entries after TTL', () => {
    jest.useFakeTimers();
    try {
      cache.set('bot1', 'q', 'a', 1000);
      expect(cache.get('bot1', 'q')).toBe('a');
      jest.advanceTimersByTime(1001);
      expect(cache.get('bot1', 'q')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('evicts oldest entries beyond max size', () => {
    for (let i = 0; i < 600; i++) {
      cache.set('bot1', `q${i}`, `a${i}`);
    }
    expect(cache.stats().size).toBe(500);
    // earliest inserted should be evicted
    expect(cache.get('bot1', 'q0')).toBeNull();
    expect(cache.get('bot1', 'q599')).toBe('a599');
  });

  it('tracks hit/miss stats and hitRate', () => {
    cache.set('bot1', 'q', 'a');
    cache.get('bot1', 'q'); // hit
    cache.get('bot1', 'missing'); // miss
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBe(0.5);
  });

  it('reports zero hitRate when no lookups', () => {
    expect(cache.stats().hitRate).toBe(0);
  });
});
