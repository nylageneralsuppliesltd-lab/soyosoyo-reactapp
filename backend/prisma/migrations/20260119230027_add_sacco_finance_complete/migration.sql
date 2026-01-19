/*
  Warnings:

  - The values [Active,Closed,Defaulted] on the enum `LoanStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `borrowerId` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `borrowerName` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `rate` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `termMonths` on the `Loan` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Ledger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balance` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interestRate` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `periodMonths` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LoanDirection" AS ENUM ('outward', 'inward');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('contribution', 'income', 'fine', 'loan_repayment', 'expense', 'dividend', 'refund', 'transfer', 'loan_disbursement');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('cash', 'pettyCash', 'mobileMoney', 'bank');

-- CreateEnum
CREATE TYPE "FineType" AS ENUM ('late_payment', 'absenteeism', 'rule_violation', 'other');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('view_members', 'edit_members', 'record_deposits', 'record_withdrawals', 'approve_loans', 'view_reports', 'manage_settings', 'manage_roles', 'view_ledger');

-- AlterEnum
BEGIN;
CREATE TYPE "LoanStatus_new" AS ENUM ('pending', 'active', 'closed', 'defaulted');
ALTER TABLE "public"."Loan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Loan" ALTER COLUMN "status" TYPE "LoanStatus_new" USING ("status"::text::"LoanStatus_new");
ALTER TYPE "LoanStatus" RENAME TO "LoanStatus_old";
ALTER TYPE "LoanStatus_new" RENAME TO "LoanStatus";
DROP TYPE "public"."LoanStatus_old";
ALTER TABLE "Loan" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'check_off';
ALTER TYPE "PaymentMethod" ADD VALUE 'bank_deposit';

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_borrowerId_fkey";

-- DropIndex
DROP INDEX "Loan_borrowerId_idx";

-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "accountId" INTEGER,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "narration" TEXT,
ADD COLUMN     "type" "TransactionType" NOT NULL DEFAULT 'contribution';

-- AlterTable
ALTER TABLE "Ledger" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "borrowerId",
DROP COLUMN "borrowerName",
DROP COLUMN "rate",
DROP COLUMN "termMonths",
ADD COLUMN     "balance" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "disbursementAccount" TEXT,
ADD COLUMN     "disbursementDate" DATE,
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "interestRate" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "interestType" TEXT NOT NULL DEFAULT 'flat',
ADD COLUMN     "loanDirection" "LoanDirection" NOT NULL DEFAULT 'outward',
ADD COLUMN     "loanTypeId" INTEGER,
ADD COLUMN     "memberId" INTEGER,
ADD COLUMN     "memberName" TEXT,
ADD COLUMN     "periodMonths" INTEGER NOT NULL,
ADD COLUMN     "schedule" JSONB,
ADD COLUMN     "typeName" TEXT,
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "role" DROP NOT NULL,
ALTER COLUMN "introducerName" DROP NOT NULL,
ALTER COLUMN "introducerMemberNo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "memberId" INTEGER,
ADD COLUMN     "principal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "accountId" INTEGER,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "narration" TEXT,
ADD COLUMN     "type" "TransactionType" NOT NULL DEFAULT 'expense',
ALTER COLUMN "memberName" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ContributionType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" TEXT,
    "typeCategory" TEXT,
    "dayOfMonth" TEXT,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "finesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceAllMembers" BOOLEAN NOT NULL DEFAULT true,
    "visibleInvoicing" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FineCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FineCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "type" "AccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bankName" TEXT,
    "branch" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "provider" TEXT,
    "number" TEXT,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxAmount" DECIMAL(14,2),
    "maxMultiple" DECIMAL(5,2),
    "periodMonths" INTEGER NOT NULL DEFAULT 12,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "interestType" TEXT NOT NULL DEFAULT 'flat',
    "lateFinesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lateFinesType" TEXT,
    "lateFinesValue" DECIMAL(5,2),
    "outstandingFinesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "outstandingFinesType" TEXT,
    "outstandingFinesValue" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fine" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "loanId" INTEGER,
    "type" "FineType" NOT NULL,
    "reason" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "paidDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "narration" TEXT,
    "debitAccountId" INTEGER NOT NULL,
    "debitAmount" DECIMAL(14,2) NOT NULL,
    "creditAccountId" INTEGER,
    "creditAmount" DECIMAL(14,2) NOT NULL,
    "category" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "sendTo" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContributionType_name_key" ON "ContributionType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_name_key" ON "IncomeCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FineCategory_name_key" ON "FineCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRole_name_key" ON "GroupRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LoanType_name_key" ON "LoanType"("name");

-- CreateIndex
CREATE INDEX "Fine_memberId_idx" ON "Fine"("memberId");

-- CreateIndex
CREATE INDEX "Fine_status_idx" ON "Fine"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_reference_idx" ON "JournalEntry"("reference");

-- CreateIndex
CREATE INDEX "Deposit_type_idx" ON "Deposit"("type");

-- CreateIndex
CREATE INDEX "Loan_memberId_idx" ON "Loan"("memberId");

-- CreateIndex
CREATE INDEX "Loan_loanDirection_idx" ON "Loan"("loanDirection");

-- CreateIndex
CREATE INDEX "Repayment_memberId_idx" ON "Repayment"("memberId");

-- CreateIndex
CREATE INDEX "Withdrawal_type_idx" ON "Withdrawal"("type");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_loanTypeId_fkey" FOREIGN KEY ("loanTypeId") REFERENCES "LoanType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
