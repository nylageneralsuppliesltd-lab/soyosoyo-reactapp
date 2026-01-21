/*
  Warnings:

  - A unique constraint covering the columns `[memberId,memberInvoiceId]` on the table `Fine` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ContributionType" ADD COLUMN     "lateFineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lateFineEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateFineGraceDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Fine" ADD COLUMN     "memberInvoiceId" INTEGER;

-- CreateIndex
CREATE INDEX "Fine_memberInvoiceId_idx" ON "Fine"("memberInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Fine_memberId_memberInvoiceId_key" ON "Fine"("memberId", "memberInvoiceId");

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_memberInvoiceId_fkey" FOREIGN KEY ("memberInvoiceId") REFERENCES "MemberInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
