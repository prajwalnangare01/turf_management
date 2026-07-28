export type SportType = 'Football' | 'Cricket' | 'Badminton' | 'Tennis' | 'Pickleball';

export type BookingSource = 'online' | 'offline_phone' | 'offline_whatsapp' | 'offline_walkin';

export type BookingStatus = 
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'no_show';

export type PaymentStatus = 
  | 'created'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partial_refund';

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'cash' | 'other_offline';

export type AdminRole = 'owner' | 'manager' | 'staff';

export type DayType = 'weekday' | 'weekend' | 'holiday';

export interface Venue {
  id: string;
  name: string;
  address: string;
  timezone: string;
  gst_number: string;
  contact_phone: string;
  is_active: boolean;
  min_notice_minutes: number;
  max_advance_days: number;
  whatsapp_enabled: boolean;
  sms_fallback_enabled: boolean;
}

export interface Sport {
  id: string;
  name: SportType;
  icon: string; // Emoji or Lucide icon name
}

export interface Court {
  id: string;
  venue_id: string;
  sport_ids: string[]; // Supports multi-purpose courts
  name: string;
  slot_duration_minutes: number; // e.g. 60 or 30
  opening_time: string; // "06:00"
  closing_time: string; // "23:00"
  buffer_minutes: number; // turnover time (e.g., 10 mins)
  status: 'active' | 'maintenance' | 'inactive';
  base_price_per_hour: number;
}

export interface PricingRule {
  id: string;
  court_id: string;
  day_type: DayType;
  start_time: string; // "18:00"
  end_time: string;   // "22:00"
  price: number;      // Peak price per slot
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  created_at: string;
  total_bookings: number;
  total_spent: number;
  no_show_count: number;
  is_blacklisted: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  is_active: boolean;
}

export interface Booking {
  id: string;
  booking_ref: string; // e.g. TRF-20260728-0001
  customer_id: string;
  court_id: string;
  sport_id: string;
  booking_date: string; // YYYY-MM-DD
  start_time: string;   // HH:mm
  end_time: string;     // HH:mm
  source: BookingSource;
  status: BookingStatus;
  total_amount: number;
  discount_amount: number;
  coupon_id?: string;
  created_by_admin_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  gateway: 'razorpay' | 'cash';
  gateway_order_id?: string;
  gateway_payment_id?: string;
  amount: number;
  status: PaymentStatus;
  method: PaymentMethod;
  raw_webhook_payload?: any;
  created_at: string;
  updated_at: string;
}

export interface SlotLock {
  court_id: string;
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:mm
  locked_by: string;  // session_id / phone
  expires_at: number; // Unix timestamp ms
}

export interface BlockedSlot {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  end_time?: string; // empty means full day
  reason: 'maintenance' | 'private_event' | 'owner_block';
  created_by_admin_id: string;
}

export interface CancellationPolicy {
  id: string;
  court_id?: string; // null means global default
  hours_before_start: number;
  refund_percentage: number;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'flat' | 'percentage';
  value: number;
  valid_from: string;
  valid_to: string;
  usage_limit: number;
  per_customer_limit: number;
  min_amount: number;
  used_count: number;
}

export interface NotificationLog {
  id: string;
  booking_id: string;
  channel: 'whatsapp' | 'sms' | 'email';
  type: 'confirmation' | 'reminder' | 'cancellation' | 'reschedule';
  status: 'sent' | 'failed' | 'delivered';
  recipient: string;
  message_preview: string;
  retry_count: number;
  sent_at: string;
}

export interface AuditLog {
  id: string;
  admin_user_id: string;
  admin_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  created_at: string;
}

// Slot computed UI view model
export interface DynamicSlot {
  start_time: string;
  end_time: string;
  price: number;
  is_peak: boolean;
  status: 'available' | 'locked' | 'booked_online' | 'booked_offline' | 'blocked' | 'past';
  lock_expires_at?: number;
  locked_by?: string;
  existing_booking?: Booking;
  blocked_reason?: string;
}
