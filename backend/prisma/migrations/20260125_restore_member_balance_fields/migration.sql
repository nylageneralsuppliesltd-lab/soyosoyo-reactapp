-- AlterTable: Add back balance and loanBalance columns to Member table
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "balance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
