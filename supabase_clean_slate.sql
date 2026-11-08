-- =============================================================================
-- TurfFlow Supabase Clean Slate (OPTIONAL: Use only if you want a fresh start)
-- Run this in Supabase SQL Editor ONLY if you want to drop previous partial tables
-- and start 100% fresh, then run supabase_setup.sql.
-- =============================================================================

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notifications_log CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS cancellation_policies CASCADE;
DROP TABLE IF EXISTS slot_locks CASCADE;
DROP TABLE IF EXISTS blocked_slots CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
DROP TABLE IF EXISTS court_sports CASCADE;
DROP TABLE IF EXISTS courts CASCADE;
DROP TABLE IF EXISTS sports CASCADE;
DROP TABLE IF EXISTS venues CASCADE;
