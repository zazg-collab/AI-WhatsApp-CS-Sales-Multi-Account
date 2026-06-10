export interface BusinessHoursConfig {
  businessHoursEnabled: boolean;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  businessDays: number[];
  businessTimezone: string | null;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when the account is currently within its configured business hours.
 * Disabled or misconfigured hours are treated as "always open" so the feature
 * fails safe (no surprise auto-away, no paused SLA). Handles overnight windows
 * (start > end) and arbitrary timezones via Intl.
 */
export function isWithinBusinessHours(acc: BusinessHoursConfig, now: Date = new Date()): boolean {
  if (!acc.businessHoursEnabled) return true;
  if (!acc.businessHoursStart || !acc.businessHoursEnd) return true;

  const start = parseHHMM(acc.businessHoursStart);
  const end = parseHHMM(acc.businessHoursEnd);
  if (start === null || end === null) return true;

  let weekday: number;
  let minutes: number;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: acc.businessTimezone || 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    weekday = WEEKDAY_INDEX[wd] ?? 1;
    minutes = hour * 60 + minute;
  } catch {
    return true;
  }

  const days = acc.businessDays?.length ? acc.businessDays : [1, 2, 3, 4, 5];
  if (!days.includes(weekday)) return false;

  return start <= end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end; // overnight window, e.g. 22:00–06:00
}
