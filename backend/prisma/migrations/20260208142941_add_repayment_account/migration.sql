-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "accountId" INTEGER;

-- CreateIndex
CREATE INDEX "Repayment_accountId_idx" ON "Repayment"("accountId");

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
