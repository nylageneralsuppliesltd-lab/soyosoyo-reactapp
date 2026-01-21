-- AlterTable
ALTER TABLE "Ledger" ADD COLUMN     "memberInvoiceId" INTEGER;

-- CreateTable
CREATE TABLE "MemberInvoice" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "contributionTypeId" INTEGER,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidDate" DATE,
    "smsNotificationSent" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLog" (
    "id" TEXT NOT NULL,
    "memberInvoiceId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvoice_invoiceNumber_key" ON "MemberInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "MemberInvoice_memberId_idx" ON "MemberInvoice"("memberId");

-- CreateIndex
CREATE INDEX "MemberInvoice_invoiceDate_idx" ON "MemberInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "MemberInvoice_dueDate_idx" ON "MemberInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "MemberInvoice_status_idx" ON "MemberInvoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLog_memberInvoiceId_idx" ON "InvoiceLog"("memberInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLog_action_idx" ON "InvoiceLog"("action");

-- CreateIndex
CREATE INDEX "InvoiceLog_createdAt_idx" ON "InvoiceLog"("createdAt");

-- CreateIndex
CREATE INDEX "Ledger_memberInvoiceId_idx" ON "Ledger"("memberInvoiceId");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_memberInvoiceId_fkey" FOREIGN KEY ("memberInvoiceId") REFERENCES "MemberInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInvoice" ADD CONSTRAINT "MemberInvoice_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInvoice" ADD CONSTRAINT "MemberInvoice_contributionTypeId_fkey" FOREIGN KEY ("contributionTypeId") REFERENCES "ContributionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLog" ADD CONSTRAINT "InvoiceLog_memberInvoiceId_fkey" FOREIGN KEY ("memberInvoiceId") REFERENCES "MemberInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
