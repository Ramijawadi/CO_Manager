-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Customers Table (Visiteurs)
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  notes text,
  status text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Products Table
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  price numeric not null default 0,
  stock integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Plans Table
create table if not exists public.plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  duration_days integer not null,
  price numeric not null default 0,
  created_at timestamp with time zone default now()
);

-- Seed default plans
insert into public.plans (name, duration_days, price) values
  ('Hebdomadaire', 7, 25.00),
  ('Mensuel', 30, 80.00)
on conflict (name) do nothing;

-- Sessions Table
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade not null,
  entry_time timestamp with time zone not null,
  exit_time timestamp with time zone,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  time_cost numeric check (time_cost >= 0),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Add time_cost column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sessions' 
        AND column_name = 'time_cost'
    ) THEN
        ALTER TABLE public.sessions ADD COLUMN time_cost numeric check (time_cost >= 0);
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_customer_id ON public.sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_entry_time ON public.sessions(entry_time DESC);

-- Session Products Table
create table if not exists public.session_products (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  quantity integer not null default 1,
  total_price numeric not null default 0,
  created_at timestamp with time zone default now()
);

-- Subscriptions Table
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade not null,
  plan_id uuid references public.plans(id) on delete set null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint subscriptions_date_check check (end_date >= start_date)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON public.subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dates ON public.subscriptions(start_date, end_date);

-- Daily Closures Table
create table if not exists public.daily_closures (
  id uuid primary key default uuid_generate_v4(),
  closure_date date unique not null,
  total_visitors integer not null default 0,
  total_revenue numeric not null default 0,
  product_sales numeric not null default 0,
  time_revenue numeric not null default 0,
  created_at timestamp with time zone default now()
);

-- Users (Roles for Auth)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff',
  created_at timestamp with time zone default now()
);

-- Setup Row Level Security (RLS)
-- If you want anyone with anon key or authenticated user to read/write without complex policies,
-- you can enable RLS and create a blanket policy (not recommended for production).
-- For this prototype, we'll allow authenticated users to perform all actions.

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.sessions enable row level security;
alter table public.session_products enable row level security;
alter table public.subscriptions enable row level security;
alter table public.daily_closures enable row level security;
alter table public.users enable row level security;

create policy "Allow all authenticated operations" on public.customers for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.products for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.plans for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.sessions for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.session_products for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.subscriptions for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.daily_closures for all to authenticated using (true) with check (true);
create policy "Allow all authenticated operations" on public.users for all to authenticated using (true) with check (true);

-- Settings Table
create table if not exists public.settings (
  id uuid primary key default uuid_generate_v4(),
  hourly_rate numeric not null default 1.0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Insert initial settings row if it doesn't exist
insert into public.settings (hourly_rate) 
select 1.0 
where not exists (select 1 from public.settings);

alter table public.settings enable row level security;
create policy "Allow all authenticated operations" on public.settings for all to authenticated using (true) with check (true);