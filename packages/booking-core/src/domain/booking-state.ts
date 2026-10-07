import type { BookingStatus } from './booking-status.js';

export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'no_show',
] as const;

export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  'cancelled',
  'completed',
  'no_show',
] as const;

export const ALLOWED_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
} as const;

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isActiveStatus(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}