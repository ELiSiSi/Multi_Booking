import { DateTime } from 'luxon';

/**
 * Add minutes to a Date. Returns a new Date (no mutation).
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Subtract minutes from a Date. Returns a new Date (no mutation).
 */
export function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60_000);
}

/**
 * Convert an IANA-local wall-clock time on a specific date
 * into a UTC instant.
 *
 * Throws if the local time is invalid or does not exist
 * because of a timezone/DST transition.
 */
export function localToUtc(
  isoDate: string,
  localTime: string,
  timezone: string,
): Date {
  const input = `${isoDate}T${localTime}`;

  const dt = DateTime.fromISO(input, {
    zone: timezone,
  });

  if (!dt.isValid) {
    throw new Error(
      `Invalid local time: ${input} @ ${timezone} — ${dt.invalidReason}`,
    );
  }

  const normalized = dt.toFormat("yyyy-MM-dd'T'HH:mm");

  if (normalized !== input) {
    throw new Error(
      `Non-existent local time: ${input} @ ${timezone}`,
    );
  }

  return dt.toUTC().toJSDate();
}

/**
 * Format a UTC instant as a local calendar date (YYYY-MM-DD)
 * in the given IANA timezone.
 */
export function utcToLocalDate(
  date: Date,
  timezone: string,
): string {
  const result = DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timezone)
    .toISODate();

  if (!result) {
    throw new Error(
      `Failed to convert date ${date.toISOString()} to timezone ${timezone}`,
    );
  }

  return result;
}

/**
 * Check whether two UTC instants fall on the same local calendar day
 * in the given timezone.
 */
export function isSameLocalDay(
  a: Date,
  b: Date,
  timezone: string,
): boolean {
  return utcToLocalDate(a, timezone) === utcToLocalDate(b, timezone);
}