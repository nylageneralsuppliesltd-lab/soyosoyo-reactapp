-- Add balance and loanBalance columns to Member table
-- Using standard PostgreSQL syntax without IF NOT EXISTS

DO $$
BEGIN
    -- Add balance column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Member' 
        AND column_name = 'balance'
    ) THEN
        ALTER TABLE "Member" ADD COLUMN "balance" DOUBLE PRECISION NOT NULL DEFAULT 0;
    END IF;

    -- Add loanBalance column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Member' 
        AND column_name = 'loanBalance'
    ) THEN
        ALTER TABLE "Member" ADD COLUMN "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
    END IF;
END $$;
