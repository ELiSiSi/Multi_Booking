import type { Weekday } from './_weekday.js';

/**
 * A time-of-day expressed as "HH:mm" in local time.
 * Always in the range 00:00..23:59.
 */
export type LocalTime = string;

/**
 * A calendar date in the resource's effective timezone.
 * Format: "YYYY-MM-DD".
 */
export type LocalDate = string;

/**
 * A half-open time interval [start, end) on the same local day.
 *
 * Invariants (enforced by DB CHECKs and validated in the domain):
 *   - start < end
 *   - both are "HH:mm"
 *   - same-day only (no crossing midnight in V1)
 */
export interface TimeWindow {
  start: LocalTime;
  end: LocalTime;
}

/**
 * A half-open absolute instant interval [start, end) in UTC.
 * Used by the slot engine after converting windows from local time.
 */
export interface InstantWindow {
  start: Date;
  end: Date;
}

/**
 * A candidate or emitted slot.
 * startAt and endAt are absolute UTC instants.
 */
export interface Slot {
  startAt: Date;
  endAt: Date;
}

/**
 * Recurring weekly rule, projected from `AvailabilityRule`.
 * `type` is either OPEN (working window) or BREAK (recurring break).
 */
export interface RecurringRule {
  id: string;
  resourceId: string;
  weekday: Weekday;
  type: 'OPEN' | 'BREAK';
  startTime: LocalTime;
  endTime: LocalTime;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

/**
 * Date-specific exception, projected from `AvailabilityException`.
 */
export interface DateException {
  id: string;
  resourceId: string;
  date: Date;
  type: 'CLOSED' | 'CUSTOM_HOURS' | 'BREAK';
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  reason: string | null;
}

/**
 * A single existing booking that occupies time on a resource.
 * `bufferMinutes` is the SNAPSHOTTED value at booking creation time
 * (it must never be re-resolved from current catalog values).
 */
export interface ActiveBooking {
  id: string;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
}

/**
 * Input to the slot engine. Everything the engine needs is passed in
 * explicitly; the engine never queries the database directly.
 */
export interface SlotEngineInput {
  /** Effective IANA timezone for this resource (Location > Business). */
  timezone: string;

  /** Date in the resource's timezone to generate slots for. */
  date: LocalDate;

  /** Service being booked. */
  service: {
    id: string;
    durationMinutes: number;
  };

  /** Resource that will perform the service. */
  resource: {
    id: string;
    bufferMinutes: number | null;
  };

  /** Business-level policy defaults. */
  business: {
    id: string;
    slotGranularityMinutes: number;
    defaultBufferMinutes: number;
  };

  /** Recurring weekly rules for this resource (already filtered by effective range). */
  rules: RecurringRule[];

  /** Date-specific exceptions for this resource on `date`. */
  exceptions: DateException[];

  /** Active bookings on this resource that may overlap the requested date. */
  bookings: ActiveBooking[];

  /** Current time (UTC). Used to filter past candidates for today. Defaults to now. */
  now?: Date;
}