-- Migration: Add time_cost column to sessions table (if not exists)
-- This migration is idempotent and safe to run multiple times
-- Created: 2026-07-13

-- Add time_cost column to sessions table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sessions' 
        AND column_name = 'time_cost'
    ) THEN
        ALTER TABLE public.sessions 
        ADD COLUMN time_cost numeric DEFAULT NULL;
        
        RAISE NOTICE 'Column time_cost added to sessions table';
    ELSE
        RAISE NOTICE 'Column time_cost already exists in sessions table';
    END IF;
END $$;

-- Add index for better query performance on completed sessions with time_cost
CREATE INDEX IF NOT EXISTS idx_sessions_time_cost 
ON public.sessions(time_cost) 
WHERE time_cost IS NOT NULL;

-- Add index for better query performance on status
CREATE INDEX IF NOT EXISTS idx_sessions_status 
ON public.sessions(status);

-- Add index for better query performance on customer_id and status combination
CREATE INDEX IF NOT EXISTS idx_sessions_customer_status 
ON public.sessions(customer_id, status);

-- Verify the column exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sessions' 
        AND column_name = 'time_cost'
    ) THEN
        RAISE NOTICE 'SUCCESS: time_cost column is present and ready to use';
    ELSE
        RAISE EXCEPTION 'ERROR: time_cost column could not be added';
    END IF;
END $$;
