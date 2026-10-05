import { DateTime } from 'luxon';

import { fromJsDay, type Weekday } from './_weekday.js';
import type {
  DateException,
  LocalDate,
  RecurringRule,
  TimeWindow,
} from './types.js';

export function resolveWeekday(date: LocalDate, timezone: string): Weekday {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid local date: ${date}`);
  }
  const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Invalid date in zone ${timezone}: ${date}`);
  }
  return fromJsDay(dt.weekday % 7);
}

function isRuleEffectiveOn(rule: RecurringRule, date: LocalDate): boolean {
  const d = DateTime.fromISO(date, { zone: 'utc' });
  if (!d.isValid) return false;

  if (rule.effectiveFrom) {
    const from = DateTime.fromJSDate(rule.effectiveFrom, { zone: 'utc' });
    if (d.toISODate()! < from.toISODate()!) return false;
  }

  if (rule.effectiveTo) {
    const to = DateTime.fromJSDate(rule.effectiveTo, { zone: 'utc' });
    if (d.toISODate()! > to.toISODate()!) return false;
  }

  return true;
}

function sameDate(a: Date, date: LocalDate): boolean {
  const d = DateTime.fromJSDate(a, { zone: 'utc' });
  return d.toISODate() === date;
}

export interface ResolvedAvailability {
  openWindows: TimeWindow[];
  breakWindows: TimeWindow[];
  isClosed: boolean;
}

export function resolveAvailability(
  date: LocalDate,
  timezone: string,
  rules: RecurringRule[],
  exceptions: DateException[],
): ResolvedAvailability {
  const exceptionsForDate = exceptions.filter((e) => sameDate(e.date, date));

  if (exceptionsForDate.some((e) => e.type === 'CLOSED')) {
    return { openWindows: [], breakWindows: [], isClosed: true };
  }

  const weekday = resolveWeekday(date, timezone);

  const weeklyOpen = rules.filter(
    (r) =>
      r.weekday === weekday &&
      r.type === 'OPEN' &&
      isRuleEffectiveOn(r, date),
  );

  const weeklyBreak = rules.filter(
    (r) =>
      r.weekday === weekday &&
      r.type === 'BREAK' &&
      isRuleEffectiveOn(r, date),
  );

  const customHours = exceptionsForDate.filter(
    (e) => e.type === 'CUSTOM_HOURS',
  );

  const exceptionBreaks = exceptionsForDate.filter(
    (e) => e.type === 'BREAK',
  );

  const baseOpen: TimeWindow[] =
    customHours.length > 0
      ? customHours.map((e) => ({
          start: e.startTime!,
          end: e.endTime!,
        }))
      : weeklyOpen.map((r) => ({
          start: r.startTime,
          end: r.endTime,
        }));

  const allBreaks: TimeWindow[] = [
    ...weeklyBreak.map((r) => ({ start: r.startTime, end: r.endTime })),
    ...exceptionBreaks.map((e) => ({
      start: e.startTime!,
      end: e.endTime!,
    })),
  ];

  return {
    openWindows: baseOpen,
    breakWindows: allBreaks,
    isClosed: false,
  };
}