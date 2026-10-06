import type { BookingStatus } from '@reservio/database';

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'no_show',
];

export const TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  'cancelled',
  'completed',
  'no_show',
];

export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
};

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