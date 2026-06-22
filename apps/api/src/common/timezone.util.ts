/**
 * Convert a local time (assumed to be in the given timezone) to UTC.
 * Example: convertToUTC("2025-12-25T14:00:00", "Asia/Jakarta") → UTC time
 */
export function convertToUTC(localTimeStr: string, timezone: string): Date {
  try {
    // Treat the wall-clock string as if it were UTC to get a reference instant.
    // The host's own timezone never enters the calculation below, so the result
    // is identical regardless of where this code runs (dev box or CI).
    const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(localTimeStr);
    const asIfUtc = new Date(hasZone ? localTimeStr : `${localTimeStr}Z`);
    if (Number.isNaN(asIfUtc.getTime())) return new Date(localTimeStr);

    // How does that instant read on the wall clock in the target timezone vs UTC?
    // The difference is the target zone's offset, which we subtract to land on the
    // real UTC instant for the requested wall-clock time. en-US formatting is used
    // identically for both sides, so its parsing quirks cancel out.
    const tzWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: timezone }));
    const utcWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offset = tzWall.getTime() - utcWall.getTime();
    return new Date(asIfUtc.getTime() - offset);
  } catch {
    return new Date(localTimeStr);
  }
}
