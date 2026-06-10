import { convertToUTC } from './timezone.util';

describe('timezone.util', () => {
  describe('convertToUTC', () => {
    it('converts Jakarta time to UTC', () => {
      const result = convertToUTC('2025-12-25T14:00:00', 'Asia/Jakarta');
      expect(result).toBeInstanceOf(Date);
      const offset = (new Date('2025-12-25T14:00:00').getTime() - result.getTime()) / 60000;
      expect(Math.abs(offset)).toBeGreaterThan(300);
      expect(Math.abs(offset)).toBeLessThan(600);
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
