import { 
  Venue, Sport, Court, PricingRule, Customer, AdminUser, Booking, 
  Payment, SlotLock, BlockedSlot, CancellationPolicy, Coupon, 
  NotificationLog, AuditLog 
} from '../types/schema';

// Initial Mock Seed Data
const DEFAULT_VENUE: Venue = {
  id: 'ven-001',
  name: 'Apex Turf & Arena',
  address: 'Plot 42, Sports Enclave, HSR Layout, Bengaluru',
  timezone: 'Asia/Kolkata',
  gst_number: '29ABCDE1234F1Z5',
  contact_phone: '+91 98765 43210',
  is_active: true,
  min_notice_minutes: 15,
  max_advance_days: 14,
  whatsapp_enabled: true,
  sms_fallback_enabled: true
};

const DEFAULT_SPORTS: Sport[] = [
  { id: 'sp-football', name: 'Football', icon: '⚽' },
  { id: 'sp-cricket', name: 'Cricket', icon: '🏏' },
  { id: 'sp-badminton', name: 'Badminton', icon: '🏸' },
  { id: 'sp-pickleball', name: 'Pickleball', icon: '🏓' }
];

const DEFAULT_COURTS: Court[] = [
  {
    id: 'crt-001',
    venue_id: 'ven-001',
    sport_ids: ['sp-football'],
    name: 'Turf A — FIFA 5-a-side Synthetic',
    slot_duration_minutes: 60,
    opening_time: '06:00',
    closing_time: '23:00',
    buffer_minutes: 10,
    status: 'active',
    base_price_per_hour: 1200
  },
  {
    id: 'crt-002',
    venue_id: 'ven-001',
    sport_ids: ['sp-football', 'sp-cricket'],
    name: 'Turf B — Multi-Sport Arena (Box Cricket / Football)',
    slot_duration_minutes: 60,
    opening_time: '06:00',
    closing_time: '23:00',
    buffer_minutes: 10,
    status: 'active',
    base_price_per_hour: 1000
  },
  {
    id: 'crt-003',
    venue_id: 'ven-001',
    sport_ids: ['sp-badminton'],
    name: 'Court 1 — BWF Indoor Wooden',
    slot_duration_minutes: 60,
    opening_time: '06:00',
    closing_time: '22:00',
    buffer_minutes: 0,
    status: 'active',
    base_price_per_hour: 500
  }
];

const DEFAULT_PRICING_RULES: PricingRule[] = [
  {
    id: 'pr-001',
    court_id: 'crt-001',
    day_type: 'weekday',
    start_time: '18:00',
    end_time: '23:00',
    price: 1600 // Evening peak pricing
  },
  {
    id: 'pr-002',
    court_id: 'crt-001',
    day_type: 'weekend',
    start_time: '06:00',
    end_time: '23:00',
    price: 1800 // All-day weekend peak
  },
  {
    id: 'pr-003',
    court_id: 'crt-002',
    day_type: 'weekday',
    start_time: '18:00',
    end_time: '23:00',
    price: 1400
  }
];

const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-101',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    created_at: '2026-07-01T10:00:00Z',
    total_bookings: 8,
    total_spent: 9600,
    no_show_count: 0,
    is_blacklisted: false
  },
  {
    id: 'cust-102',
    name: 'Ananya Verma',
    phone: '9812345678',
    email: 'ananya@example.com',
    created_at: '2026-07-15T14:30:00Z',
    total_bookings: 3,
    total_spent: 3600,
    no_show_count: 0,
    is_blacklisted: false
  },
  {
    id: 'cust-103',
    name: 'Vikram Singh (Flagged)',
    phone: '9900112233',
    email: 'vikram@example.com',
    created_at: '2026-06-20T11:15:00Z',
    total_bookings: 4,
    total_spent: 4000,
    no_show_count: 3,
    is_blacklisted: true
  }
];

const DEFAULT_ADMIN_USERS: AdminUser[] = [
  { id: 'adm-001', name: 'Sanjay Kumar (Owner)', email: 'owner@apexturf.com', phone: '9876500001', role: 'owner', is_active: true },
  { id: 'adm-002', name: 'Priya Mehta (Manager)', email: 'manager@apexturf.com', phone: '9876500002', role: 'manager', is_active: true },
  { id: 'adm-003', name: 'Arjun Das (FrontDesk Staff)', email: 'staff@apexturf.com', phone: '9876500003', role: 'staff', is_active: true }
];

const TODAY = new Date().toISOString().split('T')[0];

const DEFAULT_BOOKINGS: Booking[] = [
  {
    id: 'bk-001',
    booking_ref: 'TRF-20260728-0001',
    customer_id: 'cust-101',
    court_id: 'crt-001',
    sport_id: 'sp-football',
    booking_date: TODAY,
    start_time: '18:00',
    end_time: '19:00',
    source: 'online',
    status: 'confirmed',
    total_amount: 1600,
    discount_amount: 0,
    created_at: `${TODAY}T09:00:00Z`,
    updated_at: `${TODAY}T09:05:00Z`
  },
  {
    id: 'bk-002',
    booking_ref: 'TRF-20260728-0002',
    customer_id: 'cust-102',
    court_id: 'crt-002',
    sport_id: 'sp-cricket',
    booking_date: TODAY,
    start_time: '19:00',
    end_time: '20:00',
    source: 'offline_walkin',
    status: 'confirmed',
    total_amount: 1400,
    discount_amount: 0,
    created_by_admin_id: 'adm-003',
    notes: 'Walk-in cash customer',
    created_at: `${TODAY}T11:20:00Z`,
    updated_at: `${TODAY}T11:20:00Z`
  }
];

const DEFAULT_BLOCKED_SLOTS: BlockedSlot[] = [
  {
    id: 'blk-001',
    court_id: 'crt-003',
    date: TODAY,
    start_time: '14:00',
    end_time: '16:00',
    reason: 'maintenance',
    created_by_admin_id: 'adm-001'
  }
];

const DEFAULT_CANCELLATION_POLICIES: CancellationPolicy[] = [
  { id: 'cp-001', hours_before_start: 24, refund_percentage: 100 },
  { id: 'cp-002', hours_before_start: 6, refund_percentage: 50 },
  { id: 'cp-003', hours_before_start: 0, refund_percentage: 0 }
];

const DEFAULT_COUPONS: Coupon[] = [
  {
    id: 'cpn-001',
    code: 'WELCOME100',
    discount_type: 'flat',
    value: 100,
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    usage_limit: 500,
    per_customer_limit: 1,
    min_amount: 500,
    used_count: 42
  },
  {
    id: 'cpn-002',
    code: 'TURF20',
    discount_type: 'percentage',
    value: 20,
    valid_from: '2026-07-01',
    valid_to: '2026-08-31',
    usage_limit: 100,
    per_customer_limit: 2,
    min_amount: 1000,
    used_count: 15
  }
];

// Persistent State Helper using LocalStorage
class AppStore {
  private venue: Venue = DEFAULT_VENUE;
  private sports: Sport[] = DEFAULT_SPORTS;
  private courts: Court[] = DEFAULT_COURTS;
  private pricingRules: PricingRule[] = DEFAULT_PRICING_RULES;
  private customers: Customer[] = DEFAULT_CUSTOMERS;
  private adminUsers: AdminUser[] = DEFAULT_ADMIN_USERS;
  private bookings: Booking[] = DEFAULT_BOOKINGS;
  private payments: Payment[] = [];
  private slotLocks: SlotLock[] = [];
  private blockedSlots: BlockedSlot[] = DEFAULT_BLOCKED_SLOTS;
  private cancellationPolicies: CancellationPolicy[] = DEFAULT_CANCELLATION_POLICIES;
  private coupons: Coupon[] = DEFAULT_COUPONS;
  private notificationLogs: NotificationLog[] = [];
  private auditLogs: AuditLog[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem('TURFFLOW_STORE_V1');
      if (data) {
        const parsed = JSON.parse(data);
        this.venue = parsed.venue || DEFAULT_VENUE;
        this.sports = parsed.sports || DEFAULT_SPORTS;
        this.courts = parsed.courts || DEFAULT_COURTS;
        this.pricingRules = parsed.pricingRules || DEFAULT_PRICING_RULES;
        this.customers = parsed.customers || DEFAULT_CUSTOMERS;
        this.adminUsers = parsed.adminUsers || DEFAULT_ADMIN_USERS;
        this.bookings = parsed.bookings || DEFAULT_BOOKINGS;
        this.payments = parsed.payments || [];
        this.slotLocks = parsed.slotLocks || [];
        this.blockedSlots = parsed.blockedSlots || DEFAULT_BLOCKED_SLOTS;
        this.cancellationPolicies = parsed.cancellationPolicies || DEFAULT_CANCELLATION_POLICIES;
        this.coupons = parsed.coupons || DEFAULT_COUPONS;
        this.notificationLogs = parsed.notificationLogs || [];
        this.auditLogs = parsed.auditLogs || [];
      }
    } catch (e) {
      console.warn('LocalStorage load failed, using defaults', e);
    }
  }

  public saveToStorage() {
    try {
      localStorage.setItem('TURFFLOW_STORE_V1', JSON.stringify({
        venue: this.venue,
        sports: this.sports,
        courts: this.courts,
        pricingRules: this.pricingRules,
        customers: this.customers,
        adminUsers: this.adminUsers,
        bookings: this.bookings,
        payments: this.payments,
        slotLocks: this.slotLocks,
        blockedSlots: this.blockedSlots,
        cancellationPolicies: this.cancellationPolicies,
        coupons: this.coupons,
        notificationLogs: this.notificationLogs,
        auditLogs: this.auditLogs
      }));
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }

  // Getters
  public getVenue() { return this.venue; }
  public getSports() { return this.sports; }
  public getCourts() { return this.courts; }
  public getPricingRules() { return this.pricingRules; }
  public getCustomers() { return this.customers; }
  public getAdminUsers() { return this.adminUsers; }
  public getBookings() { return this.bookings; }
  public getPayments() { return this.payments; }
  public getSlotLocks() { return this.slotLocks; }
  public getBlockedSlots() { return this.blockedSlots; }
  public getCancellationPolicies() { return this.cancellationPolicies; }
  public getCoupons() { return this.coupons; }
  public getNotificationLogs() { return this.notificationLogs; }
  public getAuditLogs() { return this.auditLogs; }

  // Setters / Mutators
  public setVenue(venue: Venue) { this.venue = venue; this.saveToStorage(); }
  public setCourts(courts: Court[]) { this.courts = courts; this.saveToStorage(); }
  public setPricingRules(rules: PricingRule[]) { this.pricingRules = rules; this.saveToStorage(); }
  public setCustomers(customers: Customer[]) { this.customers = customers; this.saveToStorage(); }
  public setBookings(bookings: Booking[]) { this.bookings = bookings; this.saveToStorage(); }
  public setPayments(payments: Payment[]) { this.payments = payments; this.saveToStorage(); }
  public setSlotLocks(locks: SlotLock[]) { this.slotLocks = locks; this.saveToStorage(); }
  public setBlockedSlots(blocked: BlockedSlot[]) { this.blockedSlots = blocked; this.saveToStorage(); }
  public setNotificationLogs(logs: NotificationLog[]) { this.notificationLogs = logs; this.saveToStorage(); }
  public setAuditLogs(logs: AuditLog[]) { this.auditLogs = logs; this.saveToStorage(); }

  // Reset to default
  public resetToDefaults() {
    this.venue = DEFAULT_VENUE;
    this.sports = DEFAULT_SPORTS;
    this.courts = DEFAULT_COURTS;
    this.pricingRules = DEFAULT_PRICING_RULES;
    this.customers = DEFAULT_CUSTOMERS;
    this.adminUsers = DEFAULT_ADMIN_USERS;
    this.bookings = DEFAULT_BOOKINGS;
    this.payments = [];
    this.slotLocks = [];
    this.blockedSlots = DEFAULT_BLOCKED_SLOTS;
    this.cancellationPolicies = DEFAULT_CANCELLATION_POLICIES;
    this.coupons = DEFAULT_COUPONS;
    this.notificationLogs = [];
    this.auditLogs = [];
    this.saveToStorage();
  }
}

export const store = new AppStore();
