import { DateTime } from 'luxon';

import type {
  InstantWindow,
  LocalDate,
  LocalTime,
  TimeWindow,
} from './types.js';

export function parseLocalTime(value: LocalTime): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid local time: ${value}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid local time: ${value}`);
  }
  return { hour, minute };
}

export function windowToInstant(
  date: LocalDate,
  window: TimeWindow,
  timezone: string,
): InstantWindow {
  const startParts = parseLocalTime(window.start);
  const endParts = parseLocalTime(window.end);

  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid local date: ${date}`);
  }

  const start = DateTime.fromObject(
    { year, month, day, hour: startParts.hour, minute: startParts.minute },
    { zone: timezone },
  );

  const end = DateTime.fromObject(
    { year, month, day, hour: endParts.hour, minute: endParts.minute },
    { zone: timezone },
  );

  if (!start.isValid || !end.isValid) {
    throw new Error(`Invalid date/time in zone ${timezone}: ${date}`);
  }

  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}

export function minuteOfDay(value: LocalTime): number {
  const { hour, minute } = parseLocalTime(value);
  return hour * 60 + minute;
}

export function timeToJsDay(date: LocalDate, timezone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid local date: ${date}`);
  }
  const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Invalid date in zone ${timezone}: ${date}`);
  }
  return dt.weekday % 7;
}

export function todayInZone(timezone: string): LocalDate {
  const dt = DateTime.now().setZone(timezone);
  return dt.toISODate() ?? '';
}

export function nowUtc(): Date {
  return DateTime.utc().toJSDate();
}

export function addMinutes(date: Date, minutes: number): Date {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .plus({ minutes })
    .toJSDate();
}

export function isSameOrAfter(a: Date, b: Date): boolean {
  return a.getTime() >= b.getTime();
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}