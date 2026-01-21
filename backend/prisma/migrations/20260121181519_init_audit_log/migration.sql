/*
  Warnings:

  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContributionType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Deposit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExpenseCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Fine` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FineCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GroupRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncomeCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InvoiceTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JournalEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Ledger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Loan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LoanType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Member` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Repayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Withdrawal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sacco_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Fine" DROP CONSTRAINT "Fine_loanId_fkey";

-- DropForeignKey
ALTER TABLE "Fine" DROP CONSTRAINT "Fine_memberId_fkey";

-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_creditAccountId_fkey";

-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_debitAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Ledger" DROP CONSTRAINT "Ledger_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_loanTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Repayment" DROP CONSTRAINT "Repayment_loanId_fkey";

-- DropForeignKey
ALTER TABLE "Repayment" DROP CONSTRAINT "Repayment_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_memberId_fkey";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "ContributionType";

-- DropTable
DROP TABLE "Deposit";

-- DropTable
DROP TABLE "ExpenseCategory";

-- DropTable
DROP TABLE "Fine";

-- DropTable
DROP TABLE "FineCategory";

-- DropTable
DROP TABLE "GroupRole";

-- DropTable
DROP TABLE "IncomeCategory";

-- DropTable
DROP TABLE "InvoiceTemplate";

-- DropTable
DROP TABLE "JournalEntry";

-- DropTable
DROP TABLE "Ledger";

-- DropTable
DROP TABLE "Loan";

-- DropTable
DROP TABLE "LoanType";

-- DropTable
DROP TABLE "Member";

-- DropTable
DROP TABLE "Repayment";

-- DropTable
DROP TABLE "Withdrawal";

-- DropTable
DROP TABLE "history";

-- DropTable
DROP TABLE "sacco_history";

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "FineType";

-- DropEnum
DROP TYPE "LoanDirection";

-- DropEnum
DROP TYPE "LoanStatus";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "PermissionType";

-- DropEnum
DROP TYPE "TransactionType";

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
