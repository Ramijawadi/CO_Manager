-- Migration: Fix subscriptions table foreign key and constraints
-- Created: 2026-07-13

-- Add foreign key constraint for plan_id if it doesn't exist
DO $$ 
BEGIN
    -- First, check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'subscriptions_plan_id_fkey' 
        AND table_name = 'subscriptions'
    ) THEN
        -- Make sure plan_id is not null for existing records (set a default if needed)
        -- Then add the foreign key constraint
        ALTER TABLE public.subscriptions 
        ADD CONSTRAINT subscriptions_plan_id_fkey 
        FOREIGN KEY (plan_id) 
        REFERENCES public.plans(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE 'Foreign key constraint added to subscriptions.plan_id';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists for subscriptions.plan_id';
    END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id 
ON public.subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id 
ON public.subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status 
ON public.subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_dates 
ON public.subscriptions(start_date, end_date);

-- Add constraint to ensure end_date is after start_date
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'subscriptions_date_check' 
        AND table_name = 'subscriptions'
    ) THEN
        ALTER TABLE public.subscriptions 
        ADD CONSTRAINT subscriptions_date_check 
        CHECK (end_date >= start_date);
        
        RAISE NOTICE 'Date check constraint added to subscriptions';
    ELSE
        RAISE NOTICE 'Date check constraint already exists';
    END IF;
END $$;

-- Add constraint for status values
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'subscriptions_status_check' 
        AND table_name = 'subscriptions'
    ) THEN
        ALTER TABLE public.subscriptions 
        ADD CONSTRAINT subscriptions_status_check 
        CHECK (status IN ('active', 'expired', 'cancelled'));
        
        RAISE NOTICE 'Status check constraint added to subscriptions';
    ELSE
        RAISE NOTICE 'Status check constraint already exists';
    END IF;
END $$;

RAISE NOTICE 'SUCCESS: Subscriptions table constraints and indexes verified';
