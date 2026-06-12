/**
 * Convert a local time (assumed to be in the given timezone) to UTC.
 * Example: convertToUTC("2025-12-25T14:00:00", "Asia/Jakarta") → UTC time
 */
export function convertToUTC(localTimeStr: string, timezone: string): Date {
  try {
    const localDate = new Date(localTimeStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(localDate);
    const tzDate = {
      year: parseInt(parts.find((p) => p.type === 'year')?.value || '2000'),
      month: parseInt(parts.find((p) => p.type === 'month')?.value || '1') - 1,
      day: parseInt(parts.find((p) => p.type === 'day')?.value || '1'),
      hour: parseInt(parts.find((p) => p.type === 'hour')?.value || '0'),
      minute: parseInt(parts.find((p) => p.type === 'minute')?.value || '0'),
      second: parseInt(parts.find((p) => p.type === 'second')?.value || '0'),
    };

    const tzDateObj = new Date(
      tzDate.year,
      tzDate.month,
      tzDate.day,
      tzDate.hour,
      tzDate.minute,
      tzDate.second,
    );
    const offset = localDate.getTime() - tzDateObj.getTime();
    const utcDate = new Date(localDate.getTime() - offset);
    return utcDate;
  } catch {
    return new Date(localTimeStr);
  }
}
