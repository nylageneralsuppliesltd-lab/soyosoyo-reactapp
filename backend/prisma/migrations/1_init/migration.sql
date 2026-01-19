-- CreateTable "Member"
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
    "role" TEXT NOT NULL,
    "introducerName" TEXT NOT NULL,
    "introducerMemberNo" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextOfKin" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Ledger"
CREATE TABLE "Ledger" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable "history"
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

-- CreateTable "sacco_history"
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
    "period" DATE UNIQUE,

    CONSTRAINT "sacco_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_phone_key" ON "Member"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "idx_history_period" ON "history"("period");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
