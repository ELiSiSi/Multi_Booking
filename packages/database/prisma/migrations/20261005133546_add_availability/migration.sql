-- CreateEnum
CREATE TYPE "AvailabilityRuleType" AS ENUM ('OPEN', 'BREAK');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('CLOSED', 'CUSTOM_HOURS', 'BREAK');

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "type" "AvailabilityRuleType" NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityRule_resourceId_weekday_idx" ON "AvailabilityRule"("resourceId", "weekday");

-- CreateIndex
CREATE INDEX "AvailabilityRule_resourceId_type_idx" ON "AvailabilityRule"("resourceId", "type");

-- CreateIndex
CREATE INDEX "AvailabilityException_resourceId_date_idx" ON "AvailabilityException"("resourceId", "date");

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
