-- =============================================================================
-- TurfFlow Multi-Channel Booking Platform — Complete Supabase PostgreSQL Schema
-- Synchronized for Web Portal (React/Vite) & WhatsApp Automation (AI Agent/n8n)
-- SELF-HEALING: Safely updates existing tables and adds any missing columns!
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. VENUES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  gst_number VARCHAR(32),
  contact_phone VARCHAR(32) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  min_notice_minutes INT DEFAULT 15,
  max_advance_days INT DEFAULT 14,
  whatsapp_enabled BOOLEAN DEFAULT TRUE,
  sms_fallback_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  email_sender VARCHAR(255) DEFAULT 'TurfFlow Arena <rajupainter84688@gmail.com>',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'Asia/Kolkata';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS gst_number VARCHAR(32);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32) DEFAULT '+91 98765 43210';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS min_notice_minutes INT DEFAULT 15;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS max_advance_days INT DEFAULT 14;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS sms_fallback_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS email_sender VARCHAR(255) DEFAULT 'TurfFlow Arena <rajupainter84688@gmail.com>';

-- -----------------------------------------------------------------------------
-- 2. SPORTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sports (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(64) NOT NULL UNIQUE,
  icon VARCHAR(64) NOT NULL,
  image_url TEXT,
  subtitle VARCHAR(120)
);

-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
ALTER TABLE sports ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE sports ADD COLUMN IF NOT EXISTS subtitle VARCHAR(120);

-- 3. COURTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courts (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  venue_id VARCHAR(64) NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slot_duration_minutes INT NOT NULL DEFAULT 60,
  opening_time TIME NOT NULL DEFAULT '06:00',
  closing_time TIME NOT NULL DEFAULT '23:00',
  buffer_minutes INT NOT NULL DEFAULT 10,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  base_price_per_hour DECIMAL(10, 2) NOT NULL,
  saturday_price_per_hour DECIMAL(10, 2) DEFAULT 1600,
  sunday_price_per_hour DECIMAL(10, 2) DEFAULT 1600,
  weekend_price_per_hour DECIMAL(10, 2) DEFAULT 1600,
  peak_enabled BOOLEAN DEFAULT TRUE,
  peak_start_time TIME DEFAULT '18:00',
  peak_end_time TIME DEFAULT '23:00',
  peak_price_per_hour DECIMAL(10, 2) DEFAULT 1800,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE courts ADD COLUMN IF NOT EXISTS venue_id VARCHAR(64);
ALTER TABLE courts ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE courts ADD COLUMN IF NOT EXISTS slot_duration_minutes INT DEFAULT 60;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS opening_time TIME DEFAULT '06:00';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS closing_time TIME DEFAULT '23:00';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS buffer_minutes INT DEFAULT 10;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS base_price_per_hour DECIMAL(10, 2) DEFAULT 1200;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS saturday_price_per_hour DECIMAL(10, 2) DEFAULT 1600;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS sunday_price_per_hour DECIMAL(10, 2) DEFAULT 1600;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS weekend_price_per_hour DECIMAL(10, 2) DEFAULT 1600;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS peak_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS peak_start_time TIME DEFAULT '18:00';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS peak_end_time TIME DEFAULT '23:00';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS peak_price_per_hour DECIMAL(10, 2) DEFAULT 1800;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS offer_end_date DATE;

-- -----------------------------------------------------------------------------
-- 4. COURT SPORTS (Junction for multi-purpose courts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS court_sports (
  court_id VARCHAR(64) NOT NULL,
  sport_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (court_id, sport_id)
);

ALTER TABLE court_sports ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE court_sports ADD COLUMN IF NOT EXISTS sport_id VARCHAR(64);

-- -----------------------------------------------------------------------------
-- 5. PRICING RULES (Peak / Off-Peak Rates)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_rules (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) NOT NULL,
  day_type VARCHAR(16) NOT NULL DEFAULT 'weekday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS day_type VARCHAR(16) DEFAULT 'weekday';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);

-- -----------------------------------------------------------------------------
-- 6. CUSTOMERS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  password VARCHAR(255),
  total_bookings INT DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  no_show_count INT DEFAULT 0,
  is_blacklisted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_bookings INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS no_show_count INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 7. ADMIN USERS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL DEFAULT 'scrypt_hashed_password',
  role VARCHAR(16) NOT NULL DEFAULT 'staff',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 8. BOOKINGS TABLE (Core multi-channel synchronized table)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_ref VARCHAR(64) UNIQUE NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  court_id VARCHAR(64) NOT NULL,
  sport_id VARCHAR(64) NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'online',
  status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  coupon_id VARCHAR(64),
  created_by_admin_id VARCHAR(64),
  notes TEXT,
  refund_amount DECIMAL(10, 2) DEFAULT 0.00,
  refund_reason TEXT,
  refunded_at TIMESTAMP WITH TIME ZONE,
  cancelled_by VARCHAR(32),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_notice_hours DECIMAL(6, 2),
  cancellation_met_terms BOOLEAN,
  gateway_payment_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crucial: Ensure all columns exist even if bookings was previously created with fewer columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_ref VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sport_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'online';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'confirmed';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by_admin_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(32);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_notice_hours DECIMAL(6, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_met_terms BOOLEAN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- CRITICAL Layer 2 Concurrency Defense: Unique Partial Index preventing double bookings across Web & WhatsApp
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking
ON bookings (court_id, booking_date, start_time)
WHERE status IN ('pending_payment', 'confirmed');

-- -----------------------------------------------------------------------------
-- 9. PAYMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_id VARCHAR(64) NOT NULL,
  gateway VARCHAR(32) NOT NULL DEFAULT 'razorpay',
  gateway_order_id VARCHAR(255),
  gateway_payment_id VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  method VARCHAR(32) NOT NULL DEFAULT 'upi',
  raw_webhook_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS booking_id VARCHAR(64);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway VARCHAR(32) DEFAULT 'razorpay';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'created';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method VARCHAR(32) DEFAULT 'upi';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_webhook_payload JSONB;

-- -----------------------------------------------------------------------------
-- 10. BLOCKED SLOTS TABLE (Rainout / Maintenance / Private Events)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_slots (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE,
  end_time TIME,
  reason VARCHAR(32) NOT NULL DEFAULT 'maintenance',
  created_by_admin_id VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS reason VARCHAR(32) DEFAULT 'maintenance';
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS created_by_admin_id VARCHAR(64);

-- -----------------------------------------------------------------------------
-- 11. SLOT LOCKS TABLE (Real-Time Concurrency Layer 1: 5-minute hold)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_locks (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  locked_by VARCHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE slot_locks ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE slot_locks ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE slot_locks ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE slot_locks ADD COLUMN IF NOT EXISTS locked_by VARCHAR(64);
ALTER TABLE slot_locks ADD COLUMN IF NOT EXISTS expires_at BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot_lock
ON slot_locks (court_id, date, start_time);

-- -----------------------------------------------------------------------------
-- 12. CANCELLATION POLICIES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64),
  hours_before_start INT NOT NULL DEFAULT 6,
  refund_percentage INT NOT NULL DEFAULT 100
);

-- Crucial: Ensure court_id exists even if cancellation_policies already existed in Supabase!
ALTER TABLE cancellation_policies ADD COLUMN IF NOT EXISTS court_id VARCHAR(64);
ALTER TABLE cancellation_policies ADD COLUMN IF NOT EXISTS hours_before_start INT DEFAULT 6;
ALTER TABLE cancellation_policies ADD COLUMN IF NOT EXISTS refund_percentage INT DEFAULT 100;

-- -----------------------------------------------------------------------------
-- 13. COUPONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  code VARCHAR(32) UNIQUE NOT NULL,
  discount_type VARCHAR(16) NOT NULL DEFAULT 'flat',
  value DECIMAL(10, 2) NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  usage_limit INT DEFAULT 100,
  per_customer_limit INT DEFAULT 1,
  min_amount DECIMAL(10, 2) DEFAULT 0.00,
  used_count INT DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- 14. NOTIFICATIONS LOG TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications_log (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_id VARCHAR(64),
  channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp',
  type VARCHAR(32) NOT NULL DEFAULT 'confirmation',
  status VARCHAR(16) NOT NULL DEFAULT 'sent',
  recipient VARCHAR(32) NOT NULL DEFAULT '',
  message_preview TEXT,
  retry_count INT DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 15. AUDIT LOG TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  admin_user_id VARCHAR(64),
  admin_name VARCHAR(255) NOT NULL DEFAULT 'Admin',
  action VARCHAR(128) NOT NULL DEFAULT 'UPDATE',
  entity_type VARCHAR(64) NOT NULL DEFAULT 'System',
  entity_id VARCHAR(64) NOT NULL DEFAULT '',
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- SUPABASE REALTIME CONFIGURATION
-- Broadcast table mutations over WebSocket to Website & WhatsApp Server
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'courts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE courts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'blocked_slots') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE blocked_slots;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'slot_locks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE slot_locks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'venues') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venues;
  END IF;
END $$;

-- Set replica identity to FULL so UPDATE events send old & new row payload
ALTER TABLE bookings REPLICA IDENTITY FULL;
ALTER TABLE customers REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE courts REPLICA IDENTITY FULL;
ALTER TABLE blocked_slots REPLICA IDENTITY FULL;
ALTER TABLE slot_locks REPLICA IDENTITY FULL;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Zero-DROP conditional policy creation (Safe for fresh and existing instances)
-- =============================================================================
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Venues
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venues' AND policyname = 'Public Read Venues') THEN
    CREATE POLICY "Public Read Venues" ON venues FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venues' AND policyname = 'All Ops Venues') THEN
    CREATE POLICY "All Ops Venues" ON venues FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Sports
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sports' AND policyname = 'Public Read Sports') THEN
    CREATE POLICY "Public Read Sports" ON sports FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sports' AND policyname = 'All Ops Sports') THEN
    CREATE POLICY "All Ops Sports" ON sports FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Courts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'courts' AND policyname = 'Public Read Courts') THEN
    CREATE POLICY "Public Read Courts" ON courts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'courts' AND policyname = 'All Ops Courts') THEN
    CREATE POLICY "All Ops Courts" ON courts FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Court Sports
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'court_sports' AND policyname = 'Public Read Court Sports') THEN
    CREATE POLICY "Public Read Court Sports" ON court_sports FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'court_sports' AND policyname = 'All Ops Court Sports') THEN
    CREATE POLICY "All Ops Court Sports" ON court_sports FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Pricing Rules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_rules' AND policyname = 'Public Read Pricing Rules') THEN
    CREATE POLICY "Public Read Pricing Rules" ON pricing_rules FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_rules' AND policyname = 'All Ops Pricing Rules') THEN
    CREATE POLICY "All Ops Pricing Rules" ON pricing_rules FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Customers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public Read Customers') THEN
    CREATE POLICY "Public Read Customers" ON customers FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public Insert Customers') THEN
    CREATE POLICY "Public Insert Customers" ON customers FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public Update Customers') THEN
    CREATE POLICY "Public Update Customers" ON customers FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  -- Admin Users
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'All Ops Admin Users') THEN
    CREATE POLICY "All Ops Admin Users" ON admin_users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Bookings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'Public Read Bookings') THEN
    CREATE POLICY "Public Read Bookings" ON bookings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'Public Insert Bookings') THEN
    CREATE POLICY "Public Insert Bookings" ON bookings FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'Public Update Bookings') THEN
    CREATE POLICY "Public Update Bookings" ON bookings FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'Public Delete Bookings') THEN
    CREATE POLICY "Public Delete Bookings" ON bookings FOR DELETE USING (true);
  END IF;

  -- Payments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Public Read Payments') THEN
    CREATE POLICY "Public Read Payments" ON payments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Public Insert Payments') THEN
    CREATE POLICY "Public Insert Payments" ON payments FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Public Update Payments') THEN
    CREATE POLICY "Public Update Payments" ON payments FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  -- Blocked Slots
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blocked_slots' AND policyname = 'Public Read Blocked Slots') THEN
    CREATE POLICY "Public Read Blocked Slots" ON blocked_slots FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blocked_slots' AND policyname = 'All Ops Blocked Slots') THEN
    CREATE POLICY "All Ops Blocked Slots" ON blocked_slots FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Slot Locks
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'slot_locks' AND policyname = 'All Ops Slot Locks') THEN
    CREATE POLICY "All Ops Slot Locks" ON slot_locks FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Cancellation Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cancellation_policies' AND policyname = 'Public Read Cancellation Policies') THEN
    CREATE POLICY "Public Read Cancellation Policies" ON cancellation_policies FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cancellation_policies' AND policyname = 'All Ops Cancellation Policies') THEN
    CREATE POLICY "All Ops Cancellation Policies" ON cancellation_policies FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Coupons
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coupons' AND policyname = 'Public Read Coupons') THEN
    CREATE POLICY "Public Read Coupons" ON coupons FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coupons' AND policyname = 'All Ops Coupons') THEN
    CREATE POLICY "All Ops Coupons" ON coupons FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Notifications & Audit
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications_log' AND policyname = 'All Ops Notifications') THEN
    CREATE POLICY "All Ops Notifications" ON notifications_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'All Ops Audit') THEN
    CREATE POLICY "All Ops Audit" ON audit_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- INITIAL SEED DATA (Default venue, sports, courts, admin users)
-- =============================================================================
INSERT INTO venues (id, name, address, timezone, gst_number, contact_phone, is_active, min_notice_minutes, max_advance_days)
VALUES (
  'ven-001',
  'TurfFlow Arena',
  'Plot 42, Sports Enclave, Pune, Maharashtra 411045',
  'Asia/Kolkata',
  '29ABCDE1234F1Z5',
  '+91 98765 43210',
  TRUE,
  15,
  14
) ON CONFLICT (id) DO NOTHING;

INSERT INTO sports (id, name, icon) VALUES
  ('sp-football', 'Football', '⚽'),
  ('sp-cricket', 'Cricket', '🏏'),
  ('sp-badminton', 'Badminton', '🏸'),
  ('sp-pickleball', 'Pickleball', '🏓')
ON CONFLICT (name) DO NOTHING;

INSERT INTO courts (id, venue_id, name, slot_duration_minutes, opening_time, closing_time, buffer_minutes, status, base_price_per_hour, saturday_price_per_hour, sunday_price_per_hour, peak_enabled, peak_start_time, peak_end_time, peak_price_per_hour)
VALUES
  ('crt-001', 'ven-001', 'Turf A — FIFA 5-a-side Synthetic', 60, '06:00', '23:00', 0, 'active', 1200.00, 1600.00, 1600.00, TRUE, '18:00', '23:00', 1800.00),
  ('crt-002', 'ven-001', 'Turf B — Multi-Sport Arena (Box Cricket / Football)', 60, '06:00', '23:00', 0, 'active', 1000.00, 1400.00, 1400.00, TRUE, '18:00', '23:00', 1500.00),
  ('crt-003', 'ven-001', 'Court 1 — BWF Indoor Wooden', 60, '06:00', '22:00', 0, 'active', 500.00, 700.00, 700.00, TRUE, '18:00', '22:00', 800.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO court_sports (court_id, sport_id) VALUES
  ('crt-001', 'sp-football'),
  ('crt-002', 'sp-football'),
  ('crt-002', 'sp-cricket'),
  ('crt-003', 'sp-badminton')
ON CONFLICT DO NOTHING;

INSERT INTO cancellation_policies (id, court_id, hours_before_start, refund_percentage) VALUES
  ('pol-001', 'crt-001', 24, 100),
  ('pol-002', 'crt-001', 6, 50),
  ('pol-003', 'crt-001', 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_users (id, name, email, phone, password_hash, role, is_active) VALUES
  ('adm-001', 'Sanjay Kumar (Owner)', 'owner@turfflow.com', '+919876500001', 'scrypt_hashed_password', 'owner', TRUE),
  ('adm-002', 'Priya Mehta (Manager)', 'manager@turfflow.com', '+919876500002', 'scrypt_hashed_password', 'manager', TRUE),
  ('adm-003', 'Arjun Das (FrontDesk)', 'staff@turfflow.com', '+919876500003', 'scrypt_hashed_password', 'staff', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO customers (id, name, phone, email, total_bookings, total_spent, no_show_count, is_blacklisted) VALUES
  ('cust-101', 'Rahul Sharma', '+919876543210', 'rahul.sharma@example.com', 8, 9600.00, 0, FALSE),
  ('cust-102', 'Ananya Verma', '+919812345678', 'ananya@example.com', 3, 3600.00, 0, FALSE),
  ('cust-103', 'Vikram Singh (Flagged)', '+919900112233', 'vikram@example.com', 4, 4000.00, 3, TRUE)
ON CONFLICT (phone) DO NOTHING;
