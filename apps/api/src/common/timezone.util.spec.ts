import { convertToUTC } from './timezone.util';

describe('timezone.util', () => {
  describe('convertToUTC', () => {
    it('converts Jakarta time to UTC', () => {
      // 14:00 in Jakarta (UTC+7, no DST) is unambiguously 07:00 UTC. This must
      // hold regardless of the host machine's own timezone.
      const result = convertToUTC('2025-12-25T14:00:00', 'Asia/Jakarta');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2025-12-25T07:00:00.000Z');
    });

    it('converts New York time to UTC (EST)', () => {
      // 10:30 in New York during EST (UTC-5) is 15:30 UTC.
      const result = convertToUTC('2025-01-15T10:30:00', 'America/New_York');
      expect(result.toISOString()).toBe('2025-01-15T15:30:00.000Z');
    });

    it('handles invalid timezone gracefully', () => {
      const result = convertToUTC('2025-12-25T14:00:00', 'Invalid/Timezone');
      expect(result).toBeInstanceOf(Date);
    });

    it('returns a valid date', () => {
      const result = convertToUTC('2025-06-15T10:30:45', 'America/New_York');
      expect(Number.isNaN(result.getTime())).toBe(false);
    });
  });
});
