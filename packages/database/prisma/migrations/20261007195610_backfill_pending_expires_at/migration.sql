-- Backfill pendingExpiresAt for existing pending bookings.
--
-- Before this migration, the worker computed the expiration at run
-- time from `createdAt + Business.pendingTimeoutMinutes`. With the new
-- snapshot column, existing pending rows would have NULL and would
-- never be picked up by the worker.
--
-- Set pendingExpiresAt = createdAt + business.pendingTimeoutMinutes
-- for every row that is still pending and has no snapshot yet. This
-- preserves the behavior that was in effect when those bookings were
-- created.
UPDATE "Booking" AS b
SET "pendingExpiresAt" = b."createdAt"
  + make_interval(mins => biz."pendingTimeoutMinutes")
FROM "Business" AS biz
WHERE biz.id = b."businessId"
  AND b."status" = 'pending'
  AND b."pendingExpiresAt" IS NULL;