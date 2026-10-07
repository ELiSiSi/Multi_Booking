export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
] as const;