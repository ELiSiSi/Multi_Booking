ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_weekday_range"
  CHECK ("weekday" BETWEEN 1 AND 7);

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_startTime_format"
  CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_endTime_format"
  CHECK ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_start_before_end"
  CHECK ("startTime" < "endTime");

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_effective_range"
  CHECK (
    "effectiveFrom" IS NULL
    OR "effectiveTo" IS NULL
    OR "effectiveFrom" <= "effectiveTo"
  );

ALTER TABLE "AvailabilityException"
  ADD CONSTRAINT "AvailabilityException_type_times"
  CHECK (
    ("type" = 'CLOSED'       AND "startTime" IS NULL     AND "endTime" IS NULL)
    OR
    ("type" = 'CUSTOM_HOURS' AND "startTime" IS NOT NULL AND "endTime" IS NOT NULL)
    OR
    ("type" = 'BREAK'        AND "startTime" IS NOT NULL AND "endTime" IS NOT NULL)
  );

ALTER TABLE "AvailabilityException"
  ADD CONSTRAINT "AvailabilityException_startTime_format"
  CHECK (
    "startTime" IS NULL
    OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

ALTER TABLE "AvailabilityException"
  ADD CONSTRAINT "AvailabilityException_endTime_format"
  CHECK (
    "endTime" IS NULL
    OR "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

ALTER TABLE "AvailabilityException"
  ADD CONSTRAINT "AvailabilityException_start_before_end"
  CHECK (
    "type" = 'CLOSED'
    OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "startTime" < "endTime")
  );