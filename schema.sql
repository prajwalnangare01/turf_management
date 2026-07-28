-- =============================================================================
-- Turf / Sports Venue Booking Platform — Production PostgreSQL Database Schema
-- =============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Venues Table
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sports Table
CREATE TABLE IF NOT EXISTS sports (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(64) NOT NULL UNIQUE,
  icon VARCHAR(64) NOT NULL
);

-- 3. Courts Table
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Court Sports (Junction for multi-purpose courts)
CREATE TABLE IF NOT EXISTS court_sports (
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  sport_id VARCHAR(64) NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  PRIMARY KEY (court_id, sport_id)
);

-- 5. Pricing Rules (Peak / Off-Peak Rates)
CREATE TABLE IF NOT EXISTS pricing_rules (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  day_type VARCHAR(16) NOT NULL CHECK (day_type IN ('weekday', 'weekend', 'holiday')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  total_bookings INT DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  no_show_count INT DEFAULT 0,
  is_blacklisted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_ref VARCHAR(64) UNIQUE NOT NULL,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id),
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id),
  sport_id VARCHAR(64) NOT NULL REFERENCES sports(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  source VARCHAR(32) NOT NULL CHECK (source IN ('online', 'offline_phone', 'offline_whatsapp', 'offline_walkin')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'refunded', 'no_show')),
  total_amount DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  coupon_id VARCHAR(64),
  created_by_admin_id VARCHAR(64) REFERENCES admin_users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CRITICAL Layer 2 Concurrency Defense: Unique Partial Index to prevent double bookings
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking
ON bookings (court_id, booking_date, start_time)
WHERE status IN ('pending_payment', 'confirmed');

-- 9. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  gateway VARCHAR(32) NOT NULL DEFAULT 'razorpay',
  gateway_order_id VARCHAR(255),
  gateway_payment_id VARCHAR(255) UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partial_refund')),
  method VARCHAR(32) NOT NULL CHECK (method IN ('upi', 'card', 'netbanking', 'cash', 'other_offline')),
  raw_webhook_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Blocked Slots Table
CREATE TABLE IF NOT EXISTS blocked_slots (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('maintenance', 'private_event', 'owner_block')),
  created_by_admin_id VARCHAR(64) REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Cancellation Policies Table
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  court_id VARCHAR(64) REFERENCES courts(id) ON DELETE CASCADE,
  hours_before_start INT NOT NULL,
  refund_percentage INT NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100)
);

-- 12. Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  code VARCHAR(32) UNIQUE NOT NULL,
  discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('flat', 'percentage')),
  value DECIMAL(10, 2) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  usage_limit INT DEFAULT 100,
  per_customer_limit INT DEFAULT 1,
  min_amount DECIMAL(10, 2) DEFAULT 0.00,
  used_count INT DEFAULT 0
);

-- 13. Notifications Log Table
CREATE TABLE IF NOT EXISTS notifications_log (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE CASCADE,
  channel VARCHAR(16) NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  type VARCHAR(32) NOT NULL CHECK (type IN ('confirmation', 'reminder', 'cancellation', 'reschedule')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('sent', 'failed', 'delivered')),
  recipient VARCHAR(32) NOT NULL,
  message_preview TEXT,
  retry_count INT DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  admin_user_id VARCHAR(64) REFERENCES admin_users(id),
  admin_name VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
