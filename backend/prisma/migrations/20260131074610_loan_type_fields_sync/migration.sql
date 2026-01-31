/*
  Warnings:

  - You are about to drop the column `categoryLedgerId` on the `CategoryLedgerEntry` table. All the data in the column will be lost.
  - You are about to drop the column `isAdmin` on the `ExpenseCategory` table. All the data in the column will be lost.
  - You are about to drop the `CategoryLedger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncomeCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CategoryLedger" DROP CONSTRAINT "CategoryLedger_expenseCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "CategoryLedger" DROP CONSTRAINT "CategoryLedger_incomeCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "CategoryLedgerEntry" DROP CONSTRAINT "CategoryLedgerEntry_categoryLedgerId_fkey";

-- DropIndex
DROP INDEX "AssetTransaction_accountId_idx";

-- DropIndex
DROP INDEX "AssetTransaction_date_idx";

-- DropIndex
DROP INDEX "AssetTransaction_type_idx";

-- DropIndex
DROP INDEX "CategoryLedgerEntry_categoryLedgerId_idx";

-- AlterTable
ALTER TABLE "CategoryLedgerEntry" DROP COLUMN "categoryLedgerId";

-- AlterTable
ALTER TABLE "ExpenseCategory" DROP COLUMN "isAdmin",
ADD COLUMN     "amortizationMethod" TEXT,
ADD COLUMN     "approvalOfficials" TEXT,
ADD COLUMN     "approvalWorkflow" TEXT,
ADD COLUMN     "approvers" TEXT,
ADD COLUMN     "autoDisburse" BOOLEAN DEFAULT false,
ADD COLUMN     "autoDisbursement" BOOLEAN DEFAULT false,
ADD COLUMN     "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "disableProcessingIncome" BOOLEAN DEFAULT false,
ADD COLUMN     "disburseAccount" TEXT,
ADD COLUMN     "fineBase" TEXT,
ADD COLUMN     "fineFrequency" TEXT,
ADD COLUMN     "glAccount" TEXT,
ADD COLUMN     "gracePeriod" INTEGER,
ADD COLUMN     "guarantorAmount" DECIMAL(14,2),
ADD COLUMN     "guarantorName" TEXT,
ADD COLUMN     "guarantorNotified" BOOLEAN DEFAULT false,
ADD COLUMN     "guarantorType" TEXT,
ADD COLUMN     "guarantorsRequired" BOOLEAN DEFAULT false,
ADD COLUMN     "interestFrequency" TEXT,
ADD COLUMN     "interestGrace" INTEGER,
ADD COLUMN     "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interestRatePeriod" TEXT,
ADD COLUMN     "interestType" TEXT NOT NULL DEFAULT 'flat',
ADD COLUMN     "lateFineChargeOn" TEXT,
ADD COLUMN     "lateFineFrequency" TEXT,
ADD COLUMN     "lateFinesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateFinesType" TEXT,
ADD COLUMN     "lateFinesValue" DECIMAL(5,2),
ADD COLUMN     "maxAmount" DECIMAL(14,2),
ADD COLUMN     "maxGuarantors" INTEGER,
ADD COLUMN     "maxMultiple" DECIMAL(5,2),
ADD COLUMN     "maxQualificationAmount" DECIMAL(14,2),
ADD COLUMN     "minApprovals" INTEGER,
ADD COLUMN     "minGuarantors" INTEGER,
ADD COLUMN     "minQualificationAmount" DECIMAL(14,2),
ADD COLUMN     "nature" TEXT,
ADD COLUMN     "outstandingFineChargeOn" TEXT,
ADD COLUMN     "outstandingFineFrequency" TEXT,
ADD COLUMN     "outstandingFinesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outstandingFinesType" TEXT,
ADD COLUMN     "outstandingFinesValue" DECIMAL(5,2),
ADD COLUMN     "periodFlexible" TEXT,
ADD COLUMN     "periodMonths" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "periodType" TEXT,
ADD COLUMN     "principalGrace" INTEGER,
ADD COLUMN     "processingFee" DECIMAL(14,2),
ADD COLUMN     "processingFeeEnabled" BOOLEAN DEFAULT false,
ADD COLUMN     "processingFeeType" TEXT,
ADD COLUMN     "processingFeeValue" DECIMAL(14,2),
ADD COLUMN     "qualificationBasis" TEXT,
ADD COLUMN     "reconciliationCriteria" TEXT,
ADD COLUMN     "repaymentFrequency" TEXT,
ADD COLUMN     "repaymentSequence" TEXT,
ADD COLUMN     "requireCollateral" TEXT,
ADD COLUMN     "requireGuarantors" TEXT,
ADD COLUMN     "requireInsurance" TEXT,
ADD COLUMN     "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "whenGuarantorsRequired" TEXT;

-- DropTable
DROP TABLE "CategoryLedger";

-- DropTable
DROP TABLE "IncomeCategory";
