CREATE UNIQUE INDEX "AuditEvent_booking_reminder_unique"
  ON "AuditEvent" ("bookingId", "action")
  WHERE "action" = 'booking.reminder_sent'
    AND "bookingId" IS NOT NULL;