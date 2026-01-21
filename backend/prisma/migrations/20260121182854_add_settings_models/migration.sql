-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank', 'mpesa', 'check_off', 'bank_deposit', 'other');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('pending', 'active', 'closed', 'defaulted');

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

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "idNumber" TEXT,
    "dob" TIMESTAMP(3),
    "gender" TEXT,
    "physicalAddress" TEXT,
    "town" TEXT,
    "employmentStatus" TEXT,
    "employerName" TEXT,
    "regNo" TEXT,
    "employerAddress" TEXT,
    "role" TEXT,
    "introducerName" TEXT,
    "introducerMemberNo" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextOfKin" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "Deposit" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER,
    "memberName" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'contribution',
    "category" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "narration" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "accountId" INTEGER,
    "reference" TEXT,
    "notes" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER,
    "memberName" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'expense',
    "category" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "accountId" INTEGER,
    "purpose" TEXT,
    "notes" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Loan" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER,
    "memberName" TEXT,
    "bankName" TEXT,
    "loanTypeId" INTEGER,
    "typeName" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "interestType" TEXT NOT NULL DEFAULT 'flat',
    "periodMonths" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'pending',
    "loanDirection" "LoanDirection" NOT NULL DEFAULT 'outward',
    "schedule" JSONB,
    "disbursementDate" DATE,
    "disbursementAccount" TEXT,
    "startDate" DATE,
    "dueDate" DATE,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repayment" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "memberId" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "notes" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(14,2),
    "currentValue" DECIMAL(14,2),
    "location" TEXT,
    "serialNumber" TEXT,
    "condition" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history" (
    "id" SERIAL NOT NULL,
    "period" DATE NOT NULL,
    "members" INTEGER DEFAULT 0,
    "contributions" DECIMAL(15,2) DEFAULT 0.00,
    "loans_disbursed" DECIMAL(15,2) DEFAULT 0.00,
    "loans_balance" DECIMAL(15,2) DEFAULT 0.00,
    "total_bank_balance" DECIMAL(15,2) DEFAULT 0.00,
    "coop_bank" DECIMAL(15,2) DEFAULT 0.00,
    "chama_soft" DECIMAL(15,2) DEFAULT 0.00,
    "cytonn" DECIMAL(15,2) DEFAULT 0.00,
    "total_assets" DECIMAL(15,2) DEFAULT 0.00,
    "profit" DECIMAL(15,2) DEFAULT 0.00,
    "roa" DECIMAL(5,2) DEFAULT 0.00,
    "date_saved" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "extra_fields" JSONB DEFAULT '{}',

    CONSTRAINT "history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sacco_history" (
    "id" SERIAL NOT NULL,
    "members" INTEGER,
    "contributions" DECIMAL(15,2),
    "loans_balance" DECIMAL(15,2),
    "total_bank_balance" DECIMAL(15,2),
    "roa" DECIMAL(6,2),
    "date_saved" TIMESTAMP(6) DEFAULT CURRENT_DATE,
    "loans_disbursed" DECIMAL(15,2) DEFAULT 0,
    "profit" DECIMAL(15,2) DEFAULT 0,
    "coop_bank" DECIMAL(15,2) DEFAULT 0,
    "chama_soft" DECIMAL(15,2) DEFAULT 0,
    "cytonn" DECIMAL(15,2) DEFAULT 0,
    "total_assets" DECIMAL(15,2) DEFAULT 0,
    "extra_fields" JSONB DEFAULT '{}',
    "period" DATE,

    CONSTRAINT "sacco_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_phone_key" ON "Member"("phone");

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
CREATE INDEX "Deposit_memberId_idx" ON "Deposit"("memberId");

-- CreateIndex
CREATE INDEX "Deposit_date_idx" ON "Deposit"("date");

-- CreateIndex
CREATE INDEX "Deposit_type_idx" ON "Deposit"("type");

-- CreateIndex
CREATE INDEX "Withdrawal_memberId_idx" ON "Withdrawal"("memberId");

-- CreateIndex
CREATE INDEX "Withdrawal_date_idx" ON "Withdrawal"("date");

-- CreateIndex
CREATE INDEX "Withdrawal_type_idx" ON "Withdrawal"("type");

-- CreateIndex
CREATE UNIQUE INDEX "LoanType_name_key" ON "LoanType"("name");

-- CreateIndex
CREATE INDEX "Loan_memberId_idx" ON "Loan"("memberId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_loanDirection_idx" ON "Loan"("loanDirection");

-- CreateIndex
CREATE INDEX "Repayment_loanId_idx" ON "Repayment"("loanId");

-- CreateIndex
CREATE INDEX "Repayment_memberId_idx" ON "Repayment"("memberId");

-- CreateIndex
CREATE INDEX "Repayment_date_idx" ON "Repayment"("date");

-- CreateIndex
CREATE INDEX "Fine_memberId_idx" ON "Fine"("memberId");

-- CreateIndex
CREATE INDEX "Fine_status_idx" ON "Fine"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_reference_idx" ON "JournalEntry"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "idx_history_period" ON "history"("period");

-- CreateIndex
CREATE UNIQUE INDEX "sacco_history_period_key" ON "sacco_history"("period");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_loanTypeId_fkey" FOREIGN KEY ("loanTypeId") REFERENCES "LoanType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
