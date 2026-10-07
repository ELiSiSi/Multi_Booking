-- 1. Drop the existing exclusion constraint that references tsrange
--    over the (still) naive timestamp columns.
ALTER TABLE "Booking"
  DROP CONSTRAINT IF EXISTS "Booking_no_overlap_active";

-- 2. Alter column types to TIMESTAMPTZ. Reinterpret the existing
--    values as UTC instants (Prisma wrote them as UTC).
ALTER TABLE "Booking"
  ALTER COLUMN "startAt" TYPE TIMESTAMPTZ(3)
    USING "startAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt" TYPE TIMESTAMPTZ(3)
    USING "endAt" AT TIME ZONE 'UTC';

-- 3. Re-create the exclusion constraint using tstzrange (with tz).
--
--    IMPORTANT: endAt + bufferMinutes must use date_add(..., 'UTC')
--    instead of `endAt + (bufferMinutes * interval '1 minute')`.
--    The `timestamptz + interval` operator is STABLE, not IMMUTABLE,
--    because it depends on the session TimeZone. PostgreSQL rejects
--    non-immutable expressions in index/constraint definitions.
--    date_add with an explicit timezone is IMMUTABLE (PostgreSQL 16+).
--
--    Semantics are unchanged:
--      * same resourceId
--      * active statuses only (pending, confirmed, no_show)
--      * half-open interval [startAt, endAt + bufferMinutes)
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap_active"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange(
      "startAt",
      date_add("endAt", make_interval(mins => "bufferMinutes"), 'UTC'),
      '[)'
    ) WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'no_show'));