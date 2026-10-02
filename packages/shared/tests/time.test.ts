import { describe, expect, it } from 'vitest';

import {
  addMinutes,
  isSameLocalDay,
  localToUtc,
  subtractMinutes,
  utcToLocalDate,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────
// Design policy for DST handling in localToUtc()
//
// Spring-forward (non-existent local time):
//   localToUtc() REJECTS non-existent local times by comparing
//   the round-tripped value with the input. This is intentional:
//   a booking cannot be created for a wall-clock time that does
//   not exist in the business's timezone.
//
// Fall-back (ambiguous local time):
//   Luxon resolves ambiguous times to the FIRST occurrence
//   (the DST variant). Our tests below assert only that
//   localToUtc() does not throw and returns a valid instant.
//   We do not pin down which occurrence is chosen, because
//   Luxon does not guarantee this behavior across versions.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// addMinutes()
// ─────────────────────────────────────────────────────────────

describe('addMinutes()', () => {
  it('adds positive minutes', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = addMinutes(base, 30);
    expect(result.toISOString()).toBe('2026-09-25T09:30:00.000Z');
  });

  it('adds zero minutes (returns same instant)', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = addMinutes(base, 0);
    expect(result.getTime()).toBe(base.getTime());
  });

  it('adds negative minutes (equivalent to subtraction)', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = addMinutes(base, -15);
    expect(result.toISOString()).toBe('2026-09-25T08:45:00.000Z');
  });

  it('adds large values (crosses days)', () => {
    const base = new Date('2026-09-25T23:30:00.000Z');
    const result = addMinutes(base, 60);
    expect(result.toISOString()).toBe('2026-09-26T00:30:00.000Z');
  });

  it('adds very large values (crosses months)', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const result = addMinutes(base, 60 * 24 * 40); // 40 days
    expect(result.toISOString()).toBe('2026-02-10T00:00:00.000Z');
  });

  it('handles sub-minute values (fractions)', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = addMinutes(base, 0.5);
    expect(result.getTime()).toBe(base.getTime() + 30_000);
  });

  it('does NOT mutate the input date', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const originalTime = base.getTime();
    addMinutes(base, 60);
    expect(base.getTime()).toBe(originalTime);
  });

  it('returns a new Date instance', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = addMinutes(base, 15);
    expect(result).not.toBe(base);
    expect(result).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────
// subtractMinutes()
// ─────────────────────────────────────────────────────────────

describe('subtractMinutes()', () => {
  it('subtracts positive minutes', () => {
    const base = new Date('2026-09-25T09:30:00.000Z');
    const result = subtractMinutes(base, 15);
    expect(result.toISOString()).toBe('2026-09-25T09:15:00.000Z');
  });

  it('subtracts zero minutes (returns same instant)', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = subtractMinutes(base, 0);
    expect(result.getTime()).toBe(base.getTime());
  });

  it('subtracts negative minutes (equivalent to addition)', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = subtractMinutes(base, -15);
    expect(result.toISOString()).toBe('2026-09-25T09:15:00.000Z');
  });

  it('subtracts across day boundary', () => {
    const base = new Date('2026-09-25T00:30:00.000Z');
    const result = subtractMinutes(base, 60);
    expect(result.toISOString()).toBe('2026-09-24T23:30:00.000Z');
  });

  it('does NOT mutate the input date', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const originalTime = base.getTime();
    subtractMinutes(base, 60);
    expect(base.getTime()).toBe(originalTime);
  });

  it('returns a new Date instance', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = subtractMinutes(base, 15);
    expect(result).not.toBe(base);
  });

  it('addMinutes and subtractMinutes are inverses', () => {
    const base = new Date('2026-09-25T09:00:00.000Z');
    const result = subtractMinutes(addMinutes(base, 45), 45);
    expect(result.getTime()).toBe(base.getTime());
  });
});

// ─────────────────────────────────────────────────────────────
// localToUtc()
// ─────────────────────────────────────────────────────────────

describe('localToUtc()', () => {
  // ─── Happy path ──────────────────────────────────────────

  it('converts a UTC local time to the same UTC instant', () => {
    const result = localToUtc('2026-09-25', '09:00', 'UTC');
    expect(result.toISOString()).toBe('2026-09-25T09:00:00.000Z');
  });

  it('converts Cairo local time to UTC (EET, no DST in January)', () => {
    // Africa/Cairo is UTC+2 in winter
    const result = localToUtc('2026-01-15', '09:00', 'Africa/Cairo');
    expect(result.toISOString()).toBe('2026-01-15T07:00:00.000Z');
  });

  it('converts Cairo local time to UTC (EEST, DST in July)', () => {
    // Africa/Cairo is UTC+3 in summer
    const result = localToUtc('2026-07-15', '09:00', 'Africa/Cairo');
    expect(result.toISOString()).toBe('2026-07-15T06:00:00.000Z');
  });

  it('converts New York local time to UTC (EST, winter)', () => {
    // America/New_York is UTC-5 in winter
    const result = localToUtc('2026-01-15', '09:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('converts New York local time to UTC (EDT, summer)', () => {
    // America/New_York is UTC-4 in summer
    const result = localToUtc('2026-07-15', '09:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('converts Tokyo local time to UTC (JST, no DST)', () => {
    // Asia/Tokyo is UTC+9 year-round
    const result = localToUtc('2026-09-25', '09:00', 'Asia/Tokyo');
    expect(result.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('handles midnight correctly', () => {
    const result = localToUtc('2026-09-25', '00:00', 'UTC');
    expect(result.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('handles end of day correctly', () => {
    const result = localToUtc('2026-09-25', '23:59', 'UTC');
    expect(result.toISOString()).toBe('2026-09-25T23:59:00.000Z');
  });

  // ─── DST spring-forward: non-existent local times ────────
  //
  // On 2026-03-08 in America/New_York, clocks jump
  // from 02:00 to 03:00. Wall-clock times 02:00–02:59
  // do not exist. Our policy: reject them.

  it('accepts 01:59 immediately before spring-forward', () => {
    expect(() =>
      localToUtc('2026-03-08', '01:59', 'America/New_York'),
    ).not.toThrow();
  });

  it('rejects 02:00 exactly at the spring-forward boundary', () => {
    expect(() =>
      localToUtc('2026-03-08', '02:00', 'America/New_York'),
    ).toThrow(/Non-existent local time/);
  });

  it('rejects 02:30 inside the spring-forward gap', () => {
    expect(() =>
      localToUtc('2026-03-08', '02:30', 'America/New_York'),
    ).toThrow(/Non-existent local time/);
  });

  it('rejects 02:59 at the end of the spring-forward gap', () => {
    expect(() =>
      localToUtc('2026-03-08', '02:59', 'America/New_York'),
    ).toThrow(/Non-existent local time/);
  });

  it('accepts 03:00 as the first valid time after spring-forward', () => {
    const result = localToUtc('2026-03-08', '03:00', 'America/New_York');
    // After spring-forward, 03:00 EDT = 07:00 UTC
    expect(result.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  // ─── DST fall-back: ambiguous local times ────────────────
  //
  // On 2026-11-01 in America/New_York, clocks fall back
  // from 02:00 to 01:00. Wall-clock times 01:00–01:59
  // occur twice (once in EDT, once in EST).
  //
  // We only assert that the conversion succeeds and returns
  // a valid instant. We do NOT pin which occurrence Luxon
  // chooses, because Luxon does not guarantee this across
  // versions. If a specific policy is required later, it
  // must be enforced explicitly in localToUtc().

  it('does not throw for ambiguous fall-back local times', () => {
    expect(() =>
      localToUtc('2026-11-01', '01:30', 'America/New_York'),
    ).not.toThrow();
  });

  it('returns a valid UTC instant for ambiguous fall-back local times', () => {
    const result = localToUtc('2026-11-01', '01:30', 'America/New_York');
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  // ─── Invalid inputs ──────────────────────────────────────

  it('throws on completely invalid date string', () => {
    expect(() => localToUtc('not-a-date', '09:00', 'UTC')).toThrow();
  });

  it('throws on invalid time string', () => {
    expect(() => localToUtc('2026-09-25', '25:00', 'UTC')).toThrow();
  });

  it('throws on invalid timezone', () => {
    expect(() =>
      localToUtc('2026-09-25', '09:00', 'Invalid/Zone'),
    ).toThrow();
  });

  it('throws on empty date string', () => {
    expect(() => localToUtc('', '09:00', 'UTC')).toThrow();
  });

  it('throws on empty time string', () => {
    expect(() => localToUtc('2026-09-25', '', 'UTC')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// utcToLocalDate()
// ─────────────────────────────────────────────────────────────

describe('utcToLocalDate()', () => {
  it('returns the same date for UTC → UTC', () => {
    const date = new Date('2026-09-25T12:00:00.000Z');
    expect(utcToLocalDate(date, 'UTC')).toBe('2026-09-25');
  });

  it('returns the next day when local timezone is ahead', () => {
    // 22:00 UTC → 01:00 next day in Cairo (UTC+3 in summer)
    const date = new Date('2026-07-15T22:00:00.000Z');
    expect(utcToLocalDate(date, 'Africa/Cairo')).toBe('2026-07-16');
  });

  it('returns the previous day when local timezone is behind', () => {
    // 03:00 UTC → 22:00 previous day in New York (UTC-5 in winter)
    const date = new Date('2026-01-15T03:00:00.000Z');
    expect(utcToLocalDate(date, 'America/New_York')).toBe('2026-01-14');
  });

  it('returns same date when timezone is ahead but same day', () => {
    // 09:00 UTC → 11:00 same day in Cairo
    const date = new Date('2026-01-15T09:00:00.000Z');
    expect(utcToLocalDate(date, 'Africa/Cairo')).toBe('2026-01-15');
  });

  it('handles midnight UTC exactly', () => {
    const date = new Date('2026-09-25T00:00:00.000Z');
    expect(utcToLocalDate(date, 'UTC')).toBe('2026-09-25');
  });

  it('handles 23:59 UTC exactly', () => {
    const date = new Date('2026-09-25T23:59:00.000Z');
    expect(utcToLocalDate(date, 'UTC')).toBe('2026-09-25');
  });

  it('handles Tokyo (UTC+9)', () => {
    // 16:00 UTC → 01:00 next day in Tokyo
    const date = new Date('2026-09-25T16:00:00.000Z');
    expect(utcToLocalDate(date, 'Asia/Tokyo')).toBe('2026-09-26');
  });

  it('throws on invalid timezone', () => {
    const date = new Date('2026-09-25T12:00:00.000Z');
    expect(() => utcToLocalDate(date, 'Invalid/Zone')).toThrow();
  });

  it('throws on invalid Date input', () => {
    const invalid = new Date('invalid');
    expect(() => utcToLocalDate(invalid, 'UTC')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// isSameLocalDay()
// ─────────────────────────────────────────────────────────────

describe('isSameLocalDay()', () => {
  it('returns true for two instants on the same UTC day', () => {
    const a = new Date('2026-09-25T08:00:00.000Z');
    const b = new Date('2026-09-25T20:00:00.000Z');
    expect(isSameLocalDay(a, b, 'UTC')).toBe(true);
  });

  it('returns false for two instants on different UTC days', () => {
    const a = new Date('2026-09-25T23:00:00.000Z');
    const b = new Date('2026-09-26T01:00:00.000Z');
    expect(isSameLocalDay(a, b, 'UTC')).toBe(false);
  });

  it('returns true for same local day even if UTC days differ', () => {
    // In New York (UTC-4 in September, EDT):
    // a = 2026-09-26 02:00 UTC → 2026-09-25 22:00 EDT
    // b = 2026-09-26 03:00 UTC → 2026-09-25 23:00 EDT
    const a = new Date('2026-09-26T02:00:00.000Z');
    const b = new Date('2026-09-26T03:00:00.000Z');
    expect(isSameLocalDay(a, b, 'America/New_York')).toBe(true);
  });

  it('returns false for different local days even if UTC days match', () => {
    // In Tokyo (UTC+9):
    // a = 2026-09-25 14:00 UTC → 2026-09-25 23:00 JST
    // b = 2026-09-25 15:00 UTC → 2026-09-26 00:00 JST
    const a = new Date('2026-09-25T14:00:00.000Z');
    const b = new Date('2026-09-25T15:00:00.000Z');
    expect(isSameLocalDay(a, b, 'Asia/Tokyo')).toBe(false);
  });

  it('returns true for identical dates', () => {
    const a = new Date('2026-09-25T12:00:00.000Z');
    expect(isSameLocalDay(a, a, 'UTC')).toBe(true);
  });

  it('is symmetric (order does not matter)', () => {
    const a = new Date('2026-09-25T08:00:00.000Z');
    const b = new Date('2026-09-25T20:00:00.000Z');
    expect(isSameLocalDay(a, b, 'UTC')).toBe(isSameLocalDay(b, a, 'UTC'));
  });

  it('handles midnight boundary in UTC', () => {
    const before = new Date('2026-09-25T23:59:59.999Z');
    const after = new Date('2026-09-26T00:00:00.000Z');
    expect(isSameLocalDay(before, after, 'UTC')).toBe(false);
  });

  it('handles midnight boundary in Cairo', () => {
    // In winter (UTC+2):
    // 21:59:59 UTC → 23:59:59 local (Jan 15)
    // 22:00:00 UTC → 00:00:00 local (Jan 16)
    const before = new Date('2026-01-15T21:59:59.999Z');
    const after = new Date('2026-01-15T22:00:00.000Z');
    expect(isSameLocalDay(before, after, 'Africa/Cairo')).toBe(false);
  });
});