/*
  Warnings:

  - A unique constraint covering the columns `[businessId,name]` on the table `Location` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[locationId,name]` on the table `Resource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[locationId,name]` on the table `Service` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Location_businessId_name_key" ON "Location"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_locationId_name_key" ON "Resource"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_locationId_name_key" ON "Service"("locationId", "name");
