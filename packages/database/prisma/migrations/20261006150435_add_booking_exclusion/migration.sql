-- Enable btree_gist so UUID can participate in GiST EXCLUDE constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping active bookings on the same resource.
--
-- Protected interval = [startAt, endAt + bufferMinutes)
-- Applies only to active statuses: pending, confirmed, no_show.
--
-- This is the final source of truth for double-booking prevention.
-- The application performs advisory locks and availability checks as
-- defense-in-depth, but this constraint guarantees correctness even if
-- the application logic is wrong.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_active"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tsrange(
      "startAt",
      "endAt" + ("bufferMinutes" * interval '1 minute')
    ) WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'no_show'));