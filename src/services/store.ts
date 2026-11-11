import { 
  Venue, Sport, Court, PricingRule, Customer, AdminUser, Booking, 
  Payment, SlotLock, BlockedSlot, CancellationPolicy, CancellationSettings, Coupon, 
  NotificationLog, AuditLog, DataArchiveSettings 
} from '../types/schema';

// Initial Mock Seed Data
const DEFAULT_VENUE: Venue = {
  id: 'ven-001',
  name: 'TurfFlow Arena',
  address: 'Plot 42, Sports Enclave, Pune, Maharashtra 411045',
  location_url: 'https://maps.google.com/?q=18.5204,73.8567',
  google_maps_link: 'https://maps.google.com/?q=18.5204,73.8567',
  timezone: 'Asia/Kolkata',
  gst_number: '29ABCDE1234F1Z5',
  contact_phone: '+91 95791 58374',
  is_active: true,
  min_notice_minutes: 15,
  max_advance_days: 14,
  whatsapp_enabled: true,
  sms_fallback_enabled: true,
  email_enabled: true,
  email_sender: 'TurfFlow Arena <rajupainter84688@gmail.com>'
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
    buffer_minutes: 0,
    status: 'active',
    base_price_per_hour: 1350,
    original_price_per_hour: 1500,
    saturday_price_per_hour: 1600,
    saturday_offer_price_per_hour: 1440,
    sunday_price_per_hour: 1600,
    sunday_offer_price_per_hour: 1440,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '23:00',
    peak_price_per_hour: 1800,
    peak_offer_price_per_hour: 1620,
    offer_end_date: '2026-11-17'
  },
  {
    id: 'crt-002',
    venue_id: 'ven-001',
    sport_ids: ['sp-football', 'sp-cricket'],
    name: 'Turf B — Multi-Sport Arena (Box Cricket / Football)',
    slot_duration_minutes: 60,
    opening_time: '06:00',
    closing_time: '23:00',
    buffer_minutes: 0,
    status: 'active',
    base_price_per_hour: 1350,
    original_price_per_hour: 1500,
    saturday_price_per_hour: 1600,
    saturday_offer_price_per_hour: 1440,
    sunday_price_per_hour: 1600,
    sunday_offer_price_per_hour: 1440,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '23:00',
    peak_price_per_hour: 1800,
    peak_offer_price_per_hour: 1620,
    offer_end_date: '2026-11-17'
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
    base_price_per_hour: 500,
    original_price_per_hour: 700,
    saturday_price_per_hour: 700,
    sunday_price_per_hour: 700,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '22:00',
    peak_price_per_hour: 800
  }
];

const DEFAULT_PRICING_RULES: PricingRule[] = [];

const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cust-101',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    created_at: '2026-07-01T10:00:00Z',
    total_bookings: 0,
    total_spent: 0,
    no_show_count: 0,
    is_blacklisted: false
  },
  {
    id: 'cust-102',
    name: 'Ananya Verma',
    phone: '9812345678',
    email: 'ananya@example.com',
    created_at: '2026-07-15T14:30:00Z',
    total_bookings: 0,
    total_spent: 0,
    no_show_count: 0,
    is_blacklisted: false
  },
  {
    id: 'cust-103',
    name: 'Vikram Singh (Flagged)',
    phone: '9900112233',
    email: 'vikram@example.com',
    created_at: '2026-06-20T11:15:00Z',
    total_bookings: 0,
    total_spent: 0,
    no_show_count: 0,
    is_blacklisted: false
  }
];

const DEFAULT_ADMIN_USERS: AdminUser[] = [
  { id: 'adm-001', name: 'Sanjay Kumar (Owner)', email: 'rajupainter84688@gmail.com', phone: '9876500001', role: 'owner', is_active: true },
  { id: 'adm-002', name: 'Priya Mehta (Manager)', email: 'manager@turfflow.com', phone: '9876500002', role: 'manager', is_active: true },
  { id: 'adm-003', name: 'Arjun Das (FrontDesk Staff)', email: 'staff@turfflow.com', phone: '9876500003', role: 'staff', is_active: true }
];

const DEFAULT_BOOKINGS: Booking[] = [];

const TODAY = new Date().toISOString().split('T')[0];

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

const DEFAULT_CANCELLATION_SETTINGS: CancellationSettings = {
  cutoff_hours: 6,
  refund_percentage: 100,
  processing_business_days: '5-7',
  allow_cancellation_after_cutoff: true
};

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

const DEFAULT_ARCHIVE_SETTINGS: DataArchiveSettings = {
  auto_dispatch_days: 30,
  owner_email: 'owner@turfflow.com',
  last_dispatch_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  next_dispatch_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  is_active: true
};

const DEFAULT_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    admin_user_id: 'SYSTEM',
    admin_name: 'System Automation',
    action: 'DISPATCH_EMAIL_ARCHIVE',
    entity_type: 'DataArchive',
    entity_id: 'rajupainter84688@gmail.com',
    new_value: {
      recipient: 'rajupainter84688@gmail.com',
      period: 'Last Month (October 2026)',
      bookingsCount: 48,
      netRevenue: 72400,
      attachmentFilename: 'TurfFlow_Master_Ledger_October_2026.xls',
      status: 'sent'
    },
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'audit-002',
    admin_user_id: 'SYSTEM',
    admin_name: 'System Automation',
    action: 'SEND_EMAIL_CONFIRMATION',
    entity_type: 'Booking',
    entity_id: 'TRF-20261110-2221',
    new_value: {
      recipient: 'rahul.sharma@example.com',
      customerName: 'Rahul Sharma',
      bookingRef: 'TRF-20261110-2221',
      slot: '10/11/2026 07:00 PM - 08:00 PM',
      status: 'sent'
    },
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'audit-003',
    admin_user_id: 'adm-001',
    admin_name: 'Sanjay Kumar (Owner)',
    action: 'CREATE_OFFLINE_BOOKING',
    entity_type: 'Booking',
    entity_id: 'TRF-2026-0002',
    new_value: { customer_name: 'Vikram Singh', court: 'Turf A', amount: 1600 },
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'audit-004',
    admin_user_id: 'adm-002',
    admin_name: 'Amit Patel (Staff)',
    action: 'UPDATE_BOOKING_STATUS_COMPLETED',
    entity_type: 'Booking',
    entity_id: 'TRF-2026-0003',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
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
  private cancellationSettings: CancellationSettings = DEFAULT_CANCELLATION_SETTINGS;
  private dataArchiveSettings: DataArchiveSettings = DEFAULT_ARCHIVE_SETTINGS;
  private coupons: Coupon[] = DEFAULT_COUPONS;
  private notificationLogs: NotificationLog[] = [];
  private auditLogs: AuditLog[] = DEFAULT_AUDIT_LOGS;
  private listeners: (() => void)[] = [];

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public notify() {
    this.listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error(e); }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('turfflow_store_synced'));
    }
  }

  constructor() {
    this.loadFromStorage();
    this.initReconnectListener();
  }

  // CC-DB2: Supabase Realtime & Network Reconnection Sync Listener
  public syncOnReconnect() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('turfflow_store_synced'));
    }
  }

  public initReconnectListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 [Network Reconnect] Online event detected. Resyncing store state...');
        this.syncOnReconnect();
      });
    }
  }

  private loadFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const data = localStorage.getItem('TURFFLOW_STORE_V1');
      if (data) {
        const parsed = JSON.parse(data);
        this.venue = parsed.venue || DEFAULT_VENUE;
        if (this.venue.name === 'Apex Turf & Arena') {
          this.venue.name = 'TurfFlow Arena';
        }
        if (this.venue.address && this.venue.address.includes('Bengaluru')) {
          this.venue.address = 'Plot 42, Sports Enclave, Pune';
        }
        if (!this.venue.contact_phone || this.venue.contact_phone.includes('98765 43210') || this.venue.contact_phone.includes('9876543210')) {
          this.venue.contact_phone = '+91 95791 58374';
        }
        if (!this.venue.email_sender || this.venue.email_sender.includes('onboarding@resend.dev')) {
          this.venue.email_sender = 'TurfFlow Arena <rajupainter84688@gmail.com>';
        }
        if (!this.venue.contact_email || this.venue.contact_email.includes('contact@turfflow.com') || this.venue.contact_email.includes('apexturf')) {
          this.venue.contact_email = 'rajupainter84688@gmail.com';
        }
        if (!this.venue.location_url) {
          this.venue.location_url = this.venue.google_maps_link || 'https://maps.google.com/?q=18.5204,73.8567';
        }
        if (!this.venue.google_maps_link) {
          this.venue.google_maps_link = this.venue.location_url;
        }
        this.sports = parsed.sports || DEFAULT_SPORTS;
        const rawCourts: Court[] = parsed.courts || DEFAULT_COURTS;
        this.courts = rawCourts.map(c => {
          if (!c.original_price_per_hour) {
            const def = DEFAULT_COURTS.find(dc => dc.id === c.id);
            if (def && def.original_price_per_hour) {
              return { ...c, original_price_per_hour: def.original_price_per_hour };
            }
          }
          return c;
        });
        const rawRules: PricingRule[] = parsed.pricingRules || DEFAULT_PRICING_RULES;
        this.pricingRules = rawRules.filter(
          r => !(r.start_time === '18:00' && r.end_time === '23:00') &&
               !(r.day_type === 'weekend' && r.start_time === '06:00' && r.end_time === '23:00')
        );
        this.customers = parsed.customers || DEFAULT_CUSTOMERS;
        const rawAdmins: AdminUser[] = parsed.adminUsers || DEFAULT_ADMIN_USERS;
        this.adminUsers = rawAdmins.map(a => {
          if (a.role === 'owner' && (a.email === 'owner@turfflow.com' || a.email.includes('@apexturf.com'))) {
            return { ...a, email: 'rajupainter84688@gmail.com' };
          }
          return {
            ...a,
            email: a.email.replace('@apexturf.com', '@turfflow.com')
          };
        });
        const rawBookings: Booking[] = Array.isArray(parsed.bookings) ? parsed.bookings : [];
        this.bookings = rawBookings.map((b, idx) => ({
          ...b,
          booking_ref: b.booking_ref || `TRF-2026-${String(idx + 1).padStart(4, '0')}`,
          status: b.status || 'confirmed',
          source: b.source || 'online'
        }));
        this.payments = parsed.payments || [];
        this.slotLocks = parsed.slotLocks || [];
        this.blockedSlots = parsed.blockedSlots || DEFAULT_BLOCKED_SLOTS;
        this.cancellationPolicies = parsed.cancellationPolicies || DEFAULT_CANCELLATION_POLICIES;
        this.cancellationSettings = parsed.cancellationSettings || DEFAULT_CANCELLATION_SETTINGS;
        this.dataArchiveSettings = parsed.dataArchiveSettings || DEFAULT_ARCHIVE_SETTINGS;
        if (!this.dataArchiveSettings.owner_email || this.dataArchiveSettings.owner_email.includes('sanjay.turfowner') || this.dataArchiveSettings.owner_email.includes('apexturf')) {
          this.dataArchiveSettings.owner_email = 'owner@turfflow.com';
        }
        this.coupons = parsed.coupons || DEFAULT_COUPONS;
        this.notificationLogs = parsed.notificationLogs || [];
        const rawAudit = parsed.auditLogs || [];
        const sixtyDaysCutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const validAudit = rawAudit.filter((l: AuditLog) => {
          const t = new Date(l.created_at).getTime();
          return !isNaN(t) && t >= sixtyDaysCutoff;
        });
        this.auditLogs = validAudit.length > 0 ? validAudit : DEFAULT_AUDIT_LOGS;
      }
    } catch (e) {
      console.warn('LocalStorage load failed, using defaults', e);
    }
  }

  public saveToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
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
        cancellationSettings: this.cancellationSettings,
        dataArchiveSettings: this.dataArchiveSettings,
        coupons: this.coupons,
        notificationLogs: this.notificationLogs,
        auditLogs: this.auditLogs
      }));
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
    this.notify();
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
  public getCancellationSettings() { return this.cancellationSettings; }
  public getDataArchiveSettings(): DataArchiveSettings { return this.dataArchiveSettings; }
  public getCoupons() { return this.coupons; }
  public getNotificationLogs() { return this.notificationLogs; }
  public getAuditLogs() { return this.auditLogs; }

  // Setters / Mutators
  public updateDataArchiveSettings(settings: Partial<DataArchiveSettings>) {
    this.dataArchiveSettings = { ...this.dataArchiveSettings, ...settings };
    this.saveToStorage();
  }
  public setVenue(venue: Venue) { this.venue = venue; this.saveToStorage(); }
  public setSports(sports: Sport[]) { this.sports = sports; this.saveToStorage(); }
  public setCourts(courts: Court[]) { this.courts = courts; this.saveToStorage(); }
  public setPricingRules(rules: PricingRule[]) { this.pricingRules = rules; this.saveToStorage(); }
  public setCustomers(customers: Customer[]) { this.customers = customers; this.saveToStorage(); }
  public addCustomer(customer: Customer) { 
    this.customers.push(customer); 
    this.saveToStorage(); 
  }
  public setBookings(bookings: Booking[]) { this.bookings = bookings; this.saveToStorage(); }
  public setPayments(payments: Payment[]) { this.payments = payments; this.saveToStorage(); }
  public setSlotLocks(locks: SlotLock[]) { this.slotLocks = locks; this.saveToStorage(); }
  public setBlockedSlots(blocked: BlockedSlot[]) { this.blockedSlots = blocked; this.saveToStorage(); }
  public setNotificationLogs(logs: NotificationLog[]) { this.notificationLogs = logs; this.saveToStorage(); }
  public setAuditLogs(logs: AuditLog[]) { this.auditLogs = logs; this.saveToStorage(); }
  public setCancellationPolicies(policies: CancellationPolicy[]) { 
    this.cancellationPolicies = policies; 
    this.saveToStorage(); 
  }
  public setCancellationSettings(settings: CancellationSettings) {
    this.cancellationSettings = settings;
    this.saveToStorage();
  }

  // Reset to default
  public resetToDefaults() {
    this.venue = DEFAULT_VENUE;
    this.sports = DEFAULT_SPORTS;
    this.courts = DEFAULT_COURTS;
    this.pricingRules = DEFAULT_PRICING_RULES;
    this.customers = DEFAULT_CUSTOMERS;
    this.adminUsers = DEFAULT_ADMIN_USERS;
    this.bookings = [];
    this.payments = [];
    this.slotLocks = [];
    this.blockedSlots = DEFAULT_BLOCKED_SLOTS;
    this.cancellationPolicies = DEFAULT_CANCELLATION_POLICIES;
    this.cancellationSettings = DEFAULT_CANCELLATION_SETTINGS;
    this.coupons = DEFAULT_COUPONS;
    this.notificationLogs = [];
    this.auditLogs = DEFAULT_AUDIT_LOGS;
    this.saveToStorage();
  }

  // Completely clear database
  public clearAllData() {
    this.venue = DEFAULT_VENUE;
    this.sports = DEFAULT_SPORTS;
    this.courts = DEFAULT_COURTS;
    this.pricingRules = DEFAULT_PRICING_RULES;
    this.customers = DEFAULT_CUSTOMERS;
    this.adminUsers = DEFAULT_ADMIN_USERS;
    this.bookings = [];
    this.payments = [];
    this.slotLocks = [];
    this.blockedSlots = [];
    this.cancellationPolicies = DEFAULT_CANCELLATION_POLICIES;
    this.cancellationSettings = DEFAULT_CANCELLATION_SETTINGS;
    this.coupons = DEFAULT_COUPONS;
    this.notificationLogs = [];
    this.auditLogs = [];
    this.saveToStorage();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('turfflow_admin_session');
      localStorage.removeItem('turfflow_customer_session');
      localStorage.removeItem('TURFFLOW_STORE_V1');
    }
  }
}

export const store = new AppStore();
