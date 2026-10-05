import { DateTime } from 'luxon';

import { maxDate, windowToInstant } from './_time.js';
import {
  mergeIntervals,
  subtractIntervals,
} from './_intervals.js';
import { resolveAvailability } from './_windows.js';
import type {
  ActiveBooking,
  InstantWindow,
  Slot,
  SlotEngineInput,
} from './types.js';

function resolveEffectiveBuffer(input: SlotEngineInput): number {
  if (input.resource.bufferMinutes !== null) {
    return input.resource.bufferMinutes;
  }
  return input.business.defaultBufferMinutes;
}

function alignUpFromAnchor(
  target: Date,
  anchor: Date,
  granularityMinutes: number,
): Date {
  const offsetMs = target.getTime() - anchor.getTime();
  const offsetMinutes = offsetMs / 60_000;
  const aligned =
    Math.ceil(offsetMinutes / granularityMinutes) * granularityMinutes;
  return new Date(anchor.getTime() + aligned * 60_000);
}

function bookingConflict(
  bookings: ActiveBooking[],
  candidateStart: Date,
  candidateEnd: Date,
): boolean {
  for (const b of bookings) {
    if (
      candidateStart.getTime() < b.endAt.getTime() &&
      candidateEnd.getTime() > b.startAt.getTime()
    ) {
      return true;
    }
  }
  return false;
}

function bufferConflict(
  bookings: ActiveBooking[],
  candidateStart: Date,
  candidateEnd: Date,
  candidateBuffer: number,
): boolean {
  const candidateProtectedEnd =
    candidateEnd.getTime() + candidateBuffer * 60_000;

  for (const b of bookings) {
    const existingProtectedEnd =
      b.endAt.getTime() + b.bufferMinutes * 60_000;

    if (
      candidateStart.getTime() < existingProtectedEnd &&
      candidateProtectedEnd > b.startAt.getTime()
    ) {
      return true;
    }
  }
  return false;
}

function breakConflict(
  breaks: InstantWindow[],
  candidateStart: Date,
  candidateEnd: Date,
): boolean {
  for (const b of breaks) {
    if (
      candidateStart.getTime() < b.end.getTime() &&
      candidateEnd.getTime() > b.start.getTime()
    ) {
      return true;
    }
  }
  return false;
}

export function generateSlots(input: SlotEngineInput): Slot[] {
  const { timezone, date } = input;

  const resolved = resolveAvailability(
    date,
    timezone,
    input.rules,
    input.exceptions,
  );

  if (resolved.isClosed || resolved.openWindows.length === 0) {
    return [];
  }

  const openIntervals: InstantWindow[] = resolved.openWindows.map((w) =>
    windowToInstant(date, w, timezone),
  );

  const breakIntervals: InstantWindow[] = resolved.breakWindows.map((w) =>
    windowToInstant(date, w, timezone),
  );

  const availableWindows = subtractIntervals(
    mergeIntervals(openIntervals),
    mergeIntervals(breakIntervals),
  );

  if (availableWindows.length === 0) {
    return [];
  }

  const duration = input.service.durationMinutes;
  const granularity = input.business.slotGranularityMinutes;
  const candidateBuffer = resolveEffectiveBuffer(input);

  const now = input.now ?? DateTime.utc().toJSDate();

  const slots: Slot[] = [];

  for (const window of availableWindows) {
    const anchor = window.start;

    const effectiveStart = maxDate(window.start, now);

    let candidate = alignUpFromAnchor(
      effectiveStart,
      anchor,
      granularity,
    );

    while (
      candidate.getTime() + duration * 60_000 <=
      window.end.getTime()
    ) {
      const candidateEnd = new Date(candidate.getTime() + duration * 60_000);

      const hasBooking = bookingConflict(
        input.bookings,
        candidate,
        candidateEnd,
      );

      const hasBreak = breakConflict(
        breakIntervals,
        candidate,
        candidateEnd,
      );

      const hasBuffer = bufferConflict(
        input.bookings,
        candidate,
        candidateEnd,
        candidateBuffer,
      );

      if (!hasBooking && !hasBreak && !hasBuffer) {
        slots.push({ startAt: candidate, endAt: candidateEnd });
      }

      candidate = new Date(candidate.getTime() + granularity * 60_000);
    }
  }

  return slots;
}