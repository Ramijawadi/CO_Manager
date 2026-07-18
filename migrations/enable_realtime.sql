-- Enable Supabase Realtime on key tables
-- Run this in your Supabase SQL Editor

-- Publish tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE session_products;
