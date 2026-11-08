// TurfFlow Shared Data Store
// Aligned 100% with schema.sql and src/services/store.ts

export const DEFAULT_VENUE = {
  id: 'ven-001',
  name: 'TurfFlow Arena',
  address: 'Plot 42, Sports Enclave, Pune, Maharashtra 411045',
  google_maps_link: 'https://maps.google.com/?q=18.5204,73.8567',
  timezone: 'Asia/Kolkata',
  gst_number: '27ABCDE1234F1Z5',
  contact_phone: '+91 95791 58374',
  is_active: true,
  min_notice_minutes: 15,
  max_advance_days: 14,
  whatsapp_enabled: true,
  sms_fallback_enabled: true,
  amenities: [
    'FIFA-standard turf pitch',
    'Floodlights for night matches',
    'Changing rooms & showers',
    'Free parking (2-wheeler & 4-wheeler)',
    'Filtered drinking water',
    'Equipment rental (Footballs, Bibs, Cricket bats & balls)'
  ],
  rules: [
    'Turf shoes or flat rubber sole studs only (No metal studs/spikes allowed)',
    'Report 10 minutes prior to your scheduled slot',
    'No food or glass bottles allowed inside the playing area',
    'Strict zero-tolerance policy for unruly behavior'
  ]
};

export const DEFAULT_SPORTS = [
  { id: 'sp-football', name: 'Football', icon: '⚽' },
  { id: 'sp-cricket', name: 'Cricket', icon: '🏏' },
  { id: 'sp-badminton', name: 'Badminton', icon: '🏸' },
  { id: 'sp-pickleball', name: 'Pickleball', icon: '🏓' }
];

export const DEFAULT_COURTS = [
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
    base_price_per_hour: 1200,
    saturday_price_per_hour: 1600,
    sunday_price_per_hour: 1600,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '23:00',
    peak_price_per_hour: 1800
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
    base_price_per_hour: 1000,
    saturday_price_per_hour: 1400,
    sunday_price_per_hour: 1400,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '23:00',
    peak_price_per_hour: 1500
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
    saturday_price_per_hour: 700,
    sunday_price_per_hour: 700,
    peak_enabled: true,
    peak_start_time: '18:00',
    peak_end_time: '22:00',
    peak_price_per_hour: 800
  }
];

export const DEFAULT_CANCELLATION_POLICIES = [
  { id: 'cp-1', hours_before_start: 24, refund_percentage: 100, label: 'More than 24 hours before match: 100% full refund' },
  { id: 'cp-2', hours_before_start: 6, refund_percentage: 50, label: 'Between 6 and 24 hours before match: 50% partial refund' },
  { id: 'cp-3', hours_before_start: 0, refund_percentage: 0, label: 'Less than 6 hours before match: Non-refundable' }
];

export const DEFAULT_CUSTOMERS = [
  {
    id: 'cust-101',
    name: 'Rahul Sharma',
    phone: '+919876543210',
    email: 'rahul.s@example.com',
    created_at: '2026-01-15T10:00:00Z',
    total_bookings: 5,
    total_spent: 7200,
    no_show_count: 0,
    is_blacklisted: false
  },
  {
    id: 'cust-102',
    name: 'Priya Patel',
    phone: '+919812345678',
    email: 'priya.p@example.com',
    created_at: '2026-02-10T14:30:00Z',
    total_bookings: 3,
    total_spent: 3900,
    no_show_count: 0,
    is_blacklisted: false
  }
];

export const DEFAULT_BOOKINGS = [
  {
    id: 'bk-1001',
    booking_ref: 'TRF-20261105-1001',
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_phone: '+919876543210',
    court_id: 'crt-001',
    court_name: 'Turf A — FIFA 5-a-side Synthetic',
    sport_id: 'sp-football',
    sport_name: 'Football',
    booking_date: '2026-11-05',
    start_time: '19:00',
    end_time: '20:00',
    source: 'offline_whatsapp',
    status: 'confirmed',
    total_amount: 1800,
    discount_amount: 0,
    notes: 'Booked via WhatsApp AI Agent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

class Store {
  constructor() {
    this.reset();
  }

  reset() {
    this.venue = { ...DEFAULT_VENUE };
    this.sports = [...DEFAULT_SPORTS];
    this.courts = JSON.parse(JSON.stringify(DEFAULT_COURTS));
    this.cancellationPolicies = [...DEFAULT_CANCELLATION_POLICIES];
    this.customers = JSON.parse(JSON.stringify(DEFAULT_CUSTOMERS));
    this.bookings = JSON.parse(JSON.stringify(DEFAULT_BOOKINGS));
    this.blockedSlots = [];
    this.locks = new Map(); // key: `${court_id}:${date}:${start_time}`, value: { expires_at, locked_by }
    this.notifications = [];
  }

  getVenue() { return this.venue; }
  getSports() { return this.sports; }
  getCourts() { return this.courts; }
  getCancellationPolicies() { return this.cancellationPolicies; }
  getCustomers() { return this.customers; }
  getBookings() { return this.bookings; }
  getBlockedSlots() { return this.blockedSlots; }
  getNotifications() { return this.notifications; }

  findCustomerByPhone(phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    return this.customers.find(c => c.phone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone);
  }

  getOrCreateCustomer(name, phone, email = '') {
    let customer = this.findCustomerByPhone(phone);
    if (!customer) {
      customer = {
        id: `cust-${Date.now()}`,
        name: name || 'WhatsApp Player',
        phone: phone.startsWith('+') ? phone : `+91${phone.slice(-10)}`,
        email,
        created_at: new Date().toISOString(),
        total_bookings: 0,
        total_spent: 0,
        no_show_count: 0,
        is_blacklisted: false
      };
      this.customers.push(customer);
    }
    return customer;
  }
}

export const store = new Store();
