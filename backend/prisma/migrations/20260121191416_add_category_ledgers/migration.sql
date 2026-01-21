-- CreateTable
CREATE TABLE "CategoryLedger" (
    "id" SERIAL NOT NULL,
    "categoryType" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "expenseCategoryId" INTEGER,
    "incomeCategoryId" INTEGER,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryLedgerEntry" (
    "id" SERIAL NOT NULL,
    "categoryLedgerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "narration" TEXT,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLedger_categoryName_key" ON "CategoryLedger"("categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLedger_expenseCategoryId_key" ON "CategoryLedger"("expenseCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLedger_incomeCategoryId_key" ON "CategoryLedger"("incomeCategoryId");

-- CreateIndex
CREATE INDEX "CategoryLedger_categoryType_idx" ON "CategoryLedger"("categoryType");

-- CreateIndex
CREATE INDEX "CategoryLedger_categoryName_idx" ON "CategoryLedger"("categoryName");

-- CreateIndex
CREATE INDEX "CategoryLedgerEntry_categoryLedgerId_idx" ON "CategoryLedgerEntry"("categoryLedgerId");

-- CreateIndex
CREATE INDEX "CategoryLedgerEntry_date_idx" ON "CategoryLedgerEntry"("date");

-- CreateIndex
CREATE INDEX "CategoryLedgerEntry_sourceType_idx" ON "CategoryLedgerEntry"("sourceType");

-- AddForeignKey
ALTER TABLE "CategoryLedger" ADD CONSTRAINT "CategoryLedger_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryLedger" ADD CONSTRAINT "CategoryLedger_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryLedgerEntry" ADD CONSTRAINT "CategoryLedgerEntry_categoryLedgerId_fkey" FOREIGN KEY ("categoryLedgerId") REFERENCES "CategoryLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
