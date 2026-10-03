import { DateTime } from 'luxon';


export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}


export function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60_000);
}


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


export function isSameLocalDay(
  a: Date,
  b: Date,
  timezone: string,
): boolean {
  return utcToLocalDate(a, timezone) === utcToLocalDate(b, timezone);
}