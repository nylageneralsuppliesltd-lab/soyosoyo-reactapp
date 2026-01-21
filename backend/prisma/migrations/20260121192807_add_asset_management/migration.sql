/*
  Warnings:

  - You are about to drop the column `condition` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `serialNumber` on the `Asset` table. All the data in the column will be lost.
  - Made the column `category` on table `Asset` required. This step will fail if there are existing NULL values in that column.
  - Made the column `purchaseDate` on table `Asset` required. This step will fail if there are existing NULL values in that column.
  - Made the column `purchasePrice` on table `Asset` required. This step will fail if there are existing NULL values in that column.
  - Made the column `currentValue` on table `Asset` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "condition",
DROP COLUMN "isActive",
DROP COLUMN "location",
DROP COLUMN "notes",
DROP COLUMN "serialNumber",
ADD COLUMN     "depreciationRate" DECIMAL(5,2),
ADD COLUMN     "disposalAccountId" INTEGER,
ADD COLUMN     "disposalDate" DATE,
ADD COLUMN     "disposalPrice" DECIMAL(14,2),
ADD COLUMN     "disposalReason" TEXT,
ADD COLUMN     "lastValueUpdate" DATE,
ADD COLUMN     "purchaseAccountId" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "purchaseDate" SET NOT NULL,
ALTER COLUMN "purchasePrice" SET NOT NULL,
ALTER COLUMN "currentValue" SET NOT NULL;

-- CreateTable
CREATE TABLE "AssetTransaction" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accountId" INTEGER,
    "accountName" TEXT,
    "accountType" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "gainLoss" DECIMAL(14,2),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetTransaction_assetId_idx" ON "AssetTransaction"("assetId");

-- CreateIndex
CREATE INDEX "AssetTransaction_type_idx" ON "AssetTransaction"("type");

-- CreateIndex
CREATE INDEX "AssetTransaction_date_idx" ON "AssetTransaction"("date");

-- CreateIndex
CREATE INDEX "AssetTransaction_accountId_idx" ON "AssetTransaction"("accountId");

-- CreateIndex
CREATE INDEX "Asset_category_idx" ON "Asset"("category");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_purchaseDate_idx" ON "Asset"("purchaseDate");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_disposalAccountId_fkey" FOREIGN KEY ("disposalAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
