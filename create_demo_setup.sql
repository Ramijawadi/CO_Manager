-- ==========================================
-- DEMO USER SETUP & RLS PROTECTION
-- ==========================================

-- 1. Create the Demo User
-- You can run this in the Supabase SQL Editor.
-- Note: Replace 'Demo@12345' with a stronger password if desired, though this is the requested one.

DO $$
DECLARE
  demo_user_id uuid;
BEGIN
  -- Insert into auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@example.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'demo@example.com',
      crypt('Demo@12345', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    ) RETURNING id INTO demo_user_id;
  ELSE
    SELECT id INTO demo_user_id FROM auth.users WHERE email = 'demo@example.com';
  END IF;

  -- Insert into public.users with 'demo' role
  INSERT INTO public.users (id, role)
  VALUES (demo_user_id, 'demo')
  ON CONFLICT (id) DO UPDATE SET role = 'demo';
END $$;


-- ==========================================
-- 2. Update RLS Policies
-- We need to drop the old blanket policies and add more granular ones.
-- ==========================================

-- A helper function to check if the current user is NOT a demo user
CREATE OR REPLACE FUNCTION auth.is_not_demo() RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'demo'
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- Customers
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.customers;
CREATE POLICY "Allow select for all authenticated" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.customers FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.customers FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Products
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.products;
CREATE POLICY "Allow select for all authenticated" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.products FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.products FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Plans
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.plans;
CREATE POLICY "Allow select for all authenticated" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.plans FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.plans FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.plans FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Sessions
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.sessions;
CREATE POLICY "Allow select for all authenticated" ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.sessions FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.sessions FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.sessions FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Session Products
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.session_products;
CREATE POLICY "Allow select for all authenticated" ON public.session_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.session_products FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.session_products FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.session_products FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Subscriptions
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.subscriptions;
CREATE POLICY "Allow select for all authenticated" ON public.subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.subscriptions FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.subscriptions FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Daily Closures
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.daily_closures;
CREATE POLICY "Allow select for all authenticated" ON public.daily_closures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.daily_closures FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.daily_closures FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.daily_closures FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Users
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.users;
CREATE POLICY "Allow select for all authenticated" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.users FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.users FOR DELETE TO authenticated USING (auth.is_not_demo());

-- Settings
DROP POLICY IF EXISTS "Allow all authenticated operations" ON public.settings;
CREATE POLICY "Allow select for all authenticated" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for non-demo" ON public.settings FOR INSERT TO authenticated WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow update for non-demo" ON public.settings FOR UPDATE TO authenticated USING (auth.is_not_demo()) WITH CHECK (auth.is_not_demo());
CREATE POLICY "Allow delete for non-demo" ON public.settings FOR DELETE TO authenticated USING (auth.is_not_demo());
