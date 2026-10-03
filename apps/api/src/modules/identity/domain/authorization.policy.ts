import type { Actor } from './actor.js';

export class AuthorizationPolicy {
  canAsAdmin(
    actor: Actor,
    businessId: string,
    ownedBusinessIds: Set<string>,
  ): boolean {
    return actor.role === 'admin' && ownedBusinessIds.has(businessId);
  }

  isBookingOwner(
    actor: Actor,
    booking: { customerId: string },
  ): boolean {
    return actor.role === 'customer' && booking.customerId === actor.userId;
  }
}
