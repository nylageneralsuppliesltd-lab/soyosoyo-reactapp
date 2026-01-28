/*
  Warnings:

  - You are about to drop the column `accountNumber` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `idNumber` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `typeName` on the `Loan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "accountNumber",
DROP COLUMN "email",
DROP COLUMN "idNumber",
DROP COLUMN "phone",
DROP COLUMN "typeName",
ADD COLUMN     "classification" TEXT,
ADD COLUMN     "ecl" DECIMAL(14,2),
ADD COLUMN     "impairment" DECIMAL(14,2),
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "DisclosureNote" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisclosureNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IFRSConfig" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IFRSConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EclRun" (
    "id" SERIAL NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "loanCount" INTEGER,
    "totalEcl" DECIMAL(18,6),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EclRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IFRSConfig_key_key" ON "IFRSConfig"("key");
