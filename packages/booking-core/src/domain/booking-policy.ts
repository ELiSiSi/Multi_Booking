import type { BookingStatus } from './booking-status.js';

export interface PolicyBooking {
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
}

export interface PolicyBusiness {
  cancellationWindowMinutes: number;
}

export function canComplete(booking: PolicyBooking, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;

  const protectedEnd = new Date(
    booking.endAt.getTime() + booking.bufferMinutes * 60_000,
  );

  return now.getTime() >= protectedEnd.getTime();
}

export function canCustomerCancel(
  booking: PolicyBooking,
  business: PolicyBusiness,
  now: Date,
): boolean {
  if (booking.status !== 'confirmed') return true;

  const cutoff = new Date(
    booking.startAt.getTime() -
      business.cancellationWindowMinutes * 60_000,
  );

  return now.getTime() <= cutoff.getTime();
}

export function canAdminCancel(
  booking: PolicyBooking,
  now: Date,
): boolean {
  if (booking.status === 'pending') return true;

  if (booking.status !== 'confirmed') return false;

  return now.getTime() < booking.endAt.getTime();
}

export function canMarkNoShow(
  booking: PolicyBooking,
  now: Date,
): boolean {
  if (booking.status !== 'confirmed') return false;

  return now.getTime() >= booking.startAt.getTime();
}