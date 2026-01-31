/*
  Warnings:

  - A unique constraint covering the columns `[categoryLedgerId]` on the table `ExpenseCategory` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `categoryLedgerId` to the `CategoryLedgerEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CategoryLedgerEntry" ADD COLUMN     "categoryLedgerId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "categoryLedgerId" INTEGER;

-- CreateTable
CREATE TABLE "IncomeCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryLedgerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeCategory_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_name_key" ON "IncomeCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_categoryLedgerId_key" ON "IncomeCategory"("categoryLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLedger_expenseCategoryId_key" ON "CategoryLedger"("expenseCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryLedger_incomeCategoryId_key" ON "CategoryLedger"("incomeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_categoryLedgerId_key" ON "ExpenseCategory"("categoryLedgerId");

-- AddForeignKey
ALTER TABLE "CategoryLedger" ADD CONSTRAINT "CategoryLedger_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_categoryLedgerId_fkey" FOREIGN KEY ("categoryLedgerId") REFERENCES "CategoryLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryLedgerEntry" ADD CONSTRAINT "CategoryLedgerEntry_categoryLedgerId_fkey" FOREIGN KEY ("categoryLedgerId") REFERENCES "CategoryLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
