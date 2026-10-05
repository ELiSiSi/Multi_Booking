import { describe, expect, it } from 'vitest';

import { generateSlots } from '../src/modules/availability/domain/slot-engine.js';
import type {
  ActiveBooking,
  DateException,
  RecurringRule,
  SlotEngineInput,
} from '../src/modules/availability/domain/types.js';

const UTC = 'UTC';
const MONDAY = '2026-10-05';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    resourceId: 'res1',
    weekday: 1,
    type: 'OPEN',
    startTime: '09:00',
    endTime: '12:00',
    effectiveFrom: null,
    effectiveTo: null,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<SlotEngineInput> = {},
): SlotEngineInput {
  return {
    timezone: UTC,
    date: MONDAY,
    service: { id: 'svc1', durationMinutes: 30 },
    resource: { id: 'res1', bufferMinutes: null },
    business: {
      id: 'biz1',
      slotGranularityMinutes: 15,
      defaultBufferMinutes: 0,
    },
    rules: [rule()],
    exceptions: [],
    bookings: [],
    now: new Date('2026-10-05T00:00:00Z'),
    ...overrides,
  };
}

function iso(d: Date): string {
  return d.toISOString();
}

describe('Slot engine — candidate-driven algorithm', () => {
  it('30-min service, 15-min granularity, 09:00-12:00 → 11 slots', () => {
    const slots = generateSlots(baseInput());
    expect(slots).toHaveLength(11);
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T09:00:00.000Z');
    expect(iso(slots[10]!.startAt)).toBe('2026-10-05T11:30:00.000Z');
  });

  it('45-min service, 15-min granularity, 09:00-12:00 → 10 slots', () => {
    const slots = generateSlots(
      baseInput({ service: { id: 'svc1', durationMinutes: 45 } }),
    );
    expect(slots).toHaveLength(10);
    expect(iso(slots[slots.length - 1]!.startAt)).toBe(
      '2026-10-05T11:15:00.000Z',
    );
  });

  it('duration == granularity (30/30)', () => {
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 30,
          defaultBufferMinutes: 0,
        },
      }),
    );
    expect(slots).toHaveLength(6);
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T09:00:00.000Z');
    expect(iso(slots[1]!.startAt)).toBe('2026-10-05T09:30:00.000Z');
    expect(iso(slots[5]!.startAt)).toBe('2026-10-05T11:30:00.000Z');
  });

  it('duration < granularity (10/15)', () => {
    const slots = generateSlots(
      baseInput({ service: { id: 'svc1', durationMinutes: 10 } }),
    );
    expect(slots).toHaveLength(12);
    expect(iso(slots[1]!.startAt)).toBe('2026-10-05T09:15:00.000Z');
    expect(iso(slots[11]!.startAt)).toBe('2026-10-05T11:45:00.000Z');
  });

  it('duration > granularity (60/15)', () => {
    const slots = generateSlots(
      baseInput({ service: { id: 'svc1', durationMinutes: 60 } }),
    );
    expect(slots).toHaveLength(9);
    expect(iso(slots[1]!.startAt)).toBe('2026-10-05T09:15:00.000Z');
    expect(iso(slots[8]!.startAt)).toBe('2026-10-05T11:00:00.000Z');
  });

  it('buffer shifts the earliest valid candidate', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:00:00Z'),
      endAt: new Date('2026-10-05T09:30:00Z'),
      bufferMinutes: 10,
    };
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 10,
        },
        bookings: [booking],
      }),
    );
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T09:45:00.000Z');
  });

  it('candidate step is granularity — regression guard', () => {
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 15,
        },
      }),
    );
    expect(iso(slots[1]!.startAt)).toBe('2026-10-05T09:15:00.000Z');
  });

  it('past slots are never returned for today', () => {
    const slots = generateSlots(
      baseInput({ now: new Date('2026-10-05T09:20:00Z') }),
    );
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T09:30:00.000Z');
  });

  it('break removes the candidates that overlap it', () => {
    const slots = generateSlots(
      baseInput({
        rules: [
          rule({ startTime: '09:00', endTime: '17:00' }),
          rule({
            id: 'r2',
            type: 'BREAK',
            startTime: '13:00',
            endTime: '14:00',
          }),
        ],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T12:30:00.000Z');
    expect(starts).not.toContain('2026-10-05T12:45:00.000Z');
    expect(starts).not.toContain('2026-10-05T13:00:00.000Z');
    expect(starts).not.toContain('2026-10-05T13:45:00.000Z');
    expect(starts).toContain('2026-10-05T14:00:00.000Z');
  });

  it('adjacent bookings are allowed when buffer = 0', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:30:00Z'),
      endAt: new Date('2026-10-05T10:00:00Z'),
      bufferMinutes: 0,
    };
    const slots = generateSlots(baseInput({ bookings: [booking] }));
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T10:00:00.000Z');
  });

  it('buffer > 0 rejects candidates that would violate it', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:30:00Z'),
      endAt: new Date('2026-10-05T10:00:00Z'),
      bufferMinutes: 15,
    };
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 15,
        },
        bookings: [booking],
      }),
    );
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T10:15:00.000Z');
  });

  it('existing booking keeps its own snapshotted buffer (15) when current is 30', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T10:00:00Z'),
      endAt: new Date('2026-10-05T10:30:00Z'),
      bufferMinutes: 15,
    };
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 30,
        },
        bookings: [booking],
      }),
    );
    const first = slots.find(
      (s) =>
        s.startAt.getTime() >= new Date('2026-10-05T10:00:00Z').getTime(),
    );
    expect(first).toBeDefined();
    expect(iso(first!.startAt)).toBe('2026-10-05T10:45:00.000Z');
  });

  it('candidate uses the current effective buffer (15), not existing buffer (30)', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:00:00Z'),
      endAt: new Date('2026-10-05T09:30:00Z'),
      bufferMinutes: 30,
    };
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 15,
        },
        bookings: [booking],
      }),
    );
    const first = slots.find(
      (s) =>
        s.startAt.getTime() >= new Date('2026-10-05T09:00:00Z').getTime(),
    );
    expect(first).toBeDefined();
    expect(iso(first!.startAt)).toBe('2026-10-05T10:00:00.000Z');
  });
});

describe('Slot engine — exceptions', () => {
  it('CLOSED exception returns zero slots', () => {
    const ex: DateException = {
      id: 'e1',
      resourceId: 'res1',
      date: new Date('2026-10-05T00:00:00Z'),
      type: 'CLOSED',
      startTime: null,
      endTime: null,
      reason: null,
    };
    const slots = generateSlots(baseInput({ exceptions: [ex] }));
    expect(slots).toEqual([]);
  });

  it('CUSTOM_HOURS replaces the recurring OPEN windows', () => {
    const ex: DateException = {
      id: 'e1',
      resourceId: 'res1',
      date: new Date('2026-10-05T00:00:00Z'),
      type: 'CUSTOM_HOURS',
      startTime: '14:00',
      endTime: '16:00',
      reason: null,
    };
    const slots = generateSlots(baseInput({ exceptions: [ex] }));
    expect(slots.length).toBeGreaterThan(0);
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T14:00:00.000Z');
    const last = slots[slots.length - 1]!;
    expect(iso(last.endAt)).toBe('2026-10-05T16:00:00.000Z');
  });

  it('BREAK exception subtracts a specific interval', () => {
    const ex: DateException = {
      id: 'e1',
      resourceId: 'res1',
      date: new Date('2026-10-05T00:00:00Z'),
      type: 'BREAK',
      startTime: '10:00',
      endTime: '11:00',
      reason: null,
    };
    const slots = generateSlots(baseInput({ exceptions: [ex] }));
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).not.toContain('2026-10-05T10:00:00.000Z');
    expect(starts).not.toContain('2026-10-05T10:30:00.000Z');
    expect(starts).toContain('2026-10-05T11:00:00.000Z');
  });

  it('CLOSED takes precedence over CUSTOM_HOURS', () => {
    const closed: DateException = {
      id: 'e1',
      resourceId: 'res1',
      date: new Date('2026-10-05T00:00:00Z'),
      type: 'CLOSED',
      startTime: null,
      endTime: null,
      reason: null,
    };
    const custom: DateException = {
      id: 'e2',
      resourceId: 'res1',
      date: new Date('2026-10-05T00:00:00Z'),
      type: 'CUSTOM_HOURS',
      startTime: '14:00',
      endTime: '16:00',
      reason: null,
    };
    const slots = generateSlots(baseInput({ exceptions: [closed, custom] }));
    expect(slots).toEqual([]);
  });
});

describe('Slot engine — advanced boundaries and overlapping', () => {
  it('multiple open rules on the same day (morning and afternoon shifts)', () => {
    const slots = generateSlots(
      baseInput({
        rules: [
          rule({ startTime: '09:00', endTime: '12:00' }),
          rule({ id: 'r2', startTime: '13:00', endTime: '17:00' }),
        ],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T09:00:00.000Z');
    expect(starts).toContain('2026-10-05T11:30:00.000Z');
    expect(starts).not.toContain('2026-10-05T12:00:00.000Z');
    expect(starts).not.toContain('2026-10-05T12:45:00.000Z');
    expect(starts).toContain('2026-10-05T13:00:00.000Z');
    expect(starts).toContain('2026-10-05T16:30:00.000Z');
  });

  it('multiple bookings scattered throughout the day', () => {
    const b1: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:30:00Z'),
      endAt: new Date('2026-10-05T10:00:00Z'),
      bufferMinutes: 0,
    };
    const b2: ActiveBooking = {
      id: 'b2',
      startAt: new Date('2026-10-05T11:00:00Z'),
      endAt: new Date('2026-10-05T11:30:00Z'),
      bufferMinutes: 0,
    };
    const slots = generateSlots(
      baseInput({
        rules: [rule({ startTime: '09:00', endTime: '12:00' })],
        bookings: [b1, b2],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T09:00:00.000Z');
    expect(starts).not.toContain('2026-10-05T09:15:00.000Z');
    expect(starts).not.toContain('2026-10-05T09:30:00.000Z');
    expect(starts).not.toContain('2026-10-05T09:45:00.000Z');
    expect(starts).toContain('2026-10-05T10:00:00.000Z');
    expect(starts).toContain('2026-10-05T10:30:00.000Z');
    expect(starts).toContain('2026-10-05T11:30:00.000Z');
  });

  it('overlapping breaks and exceptions merge correctly', () => {
    const slots = generateSlots(
      baseInput({
        rules: [
          rule({ startTime: '09:00', endTime: '17:00' }),
          rule({ id: 'br1', type: 'BREAK', startTime: '12:00', endTime: '13:00' }),
        ],
        exceptions: [
          {
            id: 'ex1',
            resourceId: 'res1',
            date: new Date('2026-10-05T00:00:00Z'),
            type: 'BREAK',
            startTime: '12:30',
            endTime: '13:30',
            reason: null,
          },
        ],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T11:30:00.000Z');
    expect(starts).not.toContain('2026-10-05T11:45:00.000Z');
    expect(starts).not.toContain('2026-10-05T13:00:00.000Z');
    expect(starts).toContain('2026-10-05T13:30:00.000Z');
  });

  it('slots do not exceed the end of the working window (cut-off)', () => {
    const slots = generateSlots(
      baseInput({
        service: { id: 'svc1', durationMinutes: 45 },
        rules: [rule({ startTime: '09:00', endTime: '10:00' })],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toEqual([
      '2026-10-05T09:00:00.000Z',
      '2026-10-05T09:15:00.000Z',
    ]);
  });

  it('resource-level buffer overrides business-level buffer', () => {
    const bookingA: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:00:00Z'),
      endAt: new Date('2026-10-05T09:30:00Z'),
      bufferMinutes: 0,
    };
    const bookingB: ActiveBooking = {
      id: 'b2',
      startAt: new Date('2026-10-05T10:30:00Z'),
      endAt: new Date('2026-10-05T11:00:00Z'),
      bufferMinutes: 0,
    };
    const slots = generateSlots(
      baseInput({
        resource: { id: 'res1', bufferMinutes: 10 },
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 60,
        },
        bookings: [bookingA, bookingB],
      }),
    );
    // Candidate buffer = 10 (resource overrides business).
    // Candidate at 09:30 protected end = 10:00 + 10 = 10:10, before bookingB (10:30). Valid.
    // If business buffer (60) had been used, protected end = 11:00 → overlap → rejected.
    expect(iso(slots[0]!.startAt)).toBe('2026-10-05T09:30:00.000Z');
  });

  it('large candidate buffer blocks candidates that reach into a later booking', () => {
    const bookingA: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T09:00:00Z'),
      endAt: new Date('2026-10-05T09:30:00Z'),
      bufferMinutes: 0,
    };
    const bookingB: ActiveBooking = {
      id: 'b2',
      startAt: new Date('2026-10-05T10:30:00Z'),
      endAt: new Date('2026-10-05T11:00:00Z'),
      bufferMinutes: 0,
    };
    const slots = generateSlots(
      baseInput({
        business: {
          id: 'biz1',
          slotGranularityMinutes: 15,
          defaultBufferMinutes: 60,
        },
        rules: [rule({ startTime: '09:00', endTime: '12:00' })],
        bookings: [bookingA, bookingB],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    // 09:30 → protected end = 10:00 + 60 = 11:00, overlaps bookingB [10:30, 11:00). Rejected.
    expect(starts).not.toContain('2026-10-05T09:30:00.000Z');
    // 09:45 → protected end = 10:15 + 60 = 11:15, overlaps bookingB. Rejected.
    expect(starts).not.toContain('2026-10-05T09:45:00.000Z');
    // 10:00 → protected end = 10:30 + 60 = 11:30, overlaps bookingB. Rejected.
    expect(starts).not.toContain('2026-10-05T10:00:00.000Z');
    // 10:15 → protected end = 10:45 + 60 = 11:45, overlaps bookingB. Rejected.
    expect(starts).not.toContain('2026-10-05T10:15:00.000Z');
    // 10:30 → raw overlap with bookingB. Rejected.
    expect(starts).not.toContain('2026-10-05T10:30:00.000Z');
    // 10:45 → raw overlap with bookingB. Rejected.
    expect(starts).not.toContain('2026-10-05T10:45:00.000Z');
    // 11:00 → after bookingB, candidate protected end = 11:30 + 60 = 12:30 > window end. Also raw overlap check passes.
    // 11:00 + 30 = 11:30 <= 12:00, so it fits.
    expect(starts).toContain('2026-10-05T11:00:00.000Z');
  });

  it('booking completely outside working hours does not crash or incorrectly filter valid slots', () => {
    const booking: ActiveBooking = {
      id: 'b1',
      startAt: new Date('2026-10-05T07:00:00Z'),
      endAt: new Date('2026-10-05T08:00:00Z'),
      bufferMinutes: 15,
    };
    const slots = generateSlots(
      baseInput({
        rules: [rule({ startTime: '09:00', endTime: '12:00' })],
        bookings: [booking],
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T09:00:00.000Z');
  });
});

describe('Slot engine — timezones', () => {
  it('correctly shifts slots based on non-UTC timezone', () => {
    const slots = generateSlots(
      baseInput({
        timezone: 'America/New_York',
        rules: [rule({ startTime: '09:00', endTime: '10:00' })],
        now: new Date('2026-10-01T00:00:00Z'),
      }),
    );
    const starts = slots.map((s) => iso(s.startAt));
    expect(starts).toContain('2026-10-05T13:00:00.000Z');
    expect(starts).toContain('2026-10-05T13:30:00.000Z');
    expect(starts).not.toContain('2026-10-05T14:00:00.000Z');
  });
});