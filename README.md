# ⚽ TurfFlow — Production Sports Venue & Turf Booking Platform

A high-performance, production-grade sports venue booking and operations platform. Built for sports turf owners, venue managers, and customers with real-time double-booking prevention, dynamic slot calculation, Razorpay payment processing, WhatsApp notifications, and role-based venue administration.

![Platform Screenshot Mockup](https://img.shields.io/badge/Status-Production%20Ready-emerald?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Tech%20Stack-React%20%7C%20TypeScript%20%7C%20Vite%20%7C%20Tailwind/CSS-blue?style=for-the-badge)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Local Development

1. **Clone or Navigate to Project Directory**:
   ```bash
   cd "Turf Management"
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000/`

4. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 🌟 Key Architecture & Highlights

### 1. Dual-Layer Concurrency Control (Double-Booking Prevention)
The core correctness problem in sports venue booking is preventing two users (or an online customer and a front-desk walk-in) from reserving the same slot simultaneously.

- **Layer 1 — Redis Slot Locking (`redisLockService.ts`)**:
  - Executes `SET lock:{court_id}:{date}:{start_time} session_id NX EX 300` (5-minute TTL).
  - Displays a live countdown timer (`04:59`) during checkout.
  - Automatically releases lock on payment success or timeout.
  - Warns venue staff in real-time if an offline booking collides with an active online checkout lock.
- **Layer 2 — Database Unique Index (`postgresEngine.ts`)**:
  - Enforces `UNIQUE (court_id, booking_date, start_time) WHERE status IN ('pending_payment', 'confirmed')`.
  - Serves as the ultimate source of truth, rejecting duplicate database inserts cleanly.

### 2. Computed Dynamic Slot Engine (`slotEngine.ts`)
Instead of pre-generating millions of database slot rows, slots are dynamically computed on request from:
- Operating hours (e.g. `06:00` – `23:00`)
- Slot duration (e.g. 60 min or 30 min)
- Turnover buffer time between bookings (e.g. 10 min turnover for court maintenance)
- Peak / Off-peak pricing rules (Weekday evening peak ₹1,600 vs Base ₹1,200)
- Admin blocked slots (Maintenance, Private Tournaments, Owner blocks)
- Active bookings and Redis locks

### 3. Razorpay Payment Integration & Idempotency (`razorpayService.ts`)
- Razorpay order creation (`order_live_xxx`) and embedded checkout.
- Webhook signature verification (`HMAC SHA-256`) and idempotency checks (`gateway_payment_id`) to ensure webhooks can be replayed safely without double-confirming bookings.

### 4. Automated Outbound Notifications (`notificationService.ts`)
- Queue-based notification engine simulating primary **WhatsApp** dispatch with automatic **SMS** fallback.

---

## 📱 Platform Features

### 👤 Customer-Facing Booking Portal
- **Mobile-First Responsive Design (375px+)**: Designed for fast 1-handed phone bookings on the go.
- **Sport Selector**: Football ⚽, Cricket 🏏, Badminton 🏸, Pickleball 🏓.
- **Date Strip**: 14-day horizontal scrollable picker.
- **Visual Slot Grid**:
  - 🟢 **Available**: Emerald border with live price.
  - 🔵 **Locked**: Glowing electric cyan card with lock countdown.
  - 🔴 **Booked (Online)**: Crimson card.
  - 🟡 **Booked (Offline)**: Amber walk-in card.
  - ⚪ **Blocked**: Striped diagonal pattern for maintenance.
- **Multi-Slot Selection**: Book consecutive slots in a single booking row with live total price computation.
- **Phone OTP Verification**: Integrated SMS/WhatsApp OTP modal step.
- **Add to Calendar**: Downloadable `.ics` iCalendar file generator for Apple & Google Calendar.
- **Self-Serve Booking Lookup & Cancellation**: Phone number lookup with automated tiered refund calculation (>24h = 100%, 6–24h = 50%, <6h = 0%).

---

### 🛡️ Admin Operations Portal
- **Role-Based Access Control (RBAC)**: Switch between `Owner` (Full access), `Manager` (Bookings + Calendar + Blocks), and `Staff` (Counter bookings & Status updates only).
- **High-Density Schedule Matrix (`ScheduleCalendarView.tsx`)**: Daily grid with courts as columns and time as rows. Click empty slot for offline booking; click booking for detail drawer.
- **Fast Offline Walk-In Booking Modal (`OfflineBookingModal.tsx`)**: Counter sales form with real-time customer lock collision warnings.
- **Bookings Directory (`BookingListView.tsx`)**: Filterable table by court, source (online/walk-in/phone), date, and status with quick status transitions (`confirmed` ➔ `completed` / `no_show` / `cancelled`).
- **Court Settings & Pricing (`CourtPricingManager.tsx`)**: Buffer minutes, slot duration, operating hours, peak rates, and schedule block creation.
- **Customer CRM (`CustomerCRM.tsx`)**: Total bookings, spent metrics, no-show counters, and one-click blacklist controls.
- **Financial Analytics & CSV Exporter (`ReportsAnalytics.tsx`)**: Revenue trend metrics, source breakdown, and one-click CSV report export.
- **Audit Log Trail (`AuditLogViewer.tsx`)**: Full audit history of admin user actions and entity diffs.
- **Venue Settings (`SettingsPanel.tsx`)**: GST number, timezone, minimum notice window, advance booking limit, notification toggles, and database reset trigger.

---

## 📂 Project Folder Structure

```
c:/Turf Management/
├── package.json               # Node.js dependencies & build scripts
├── vite.config.ts             # Vite development server configuration
├── tsconfig.json              # TypeScript compiler configuration
├── index.html                 # Main HTML entrypoint & font imports
├── README.md                  # Comprehensive project documentation
└── src/
    ├── index.css              # Styling system with CSS custom properties & badge themes
    ├── main.tsx               # React DOM root entry point
    ├── App.tsx                # App root manager with Customer/Admin view switcher
    ├── types/
    │   └── schema.ts          # Core domain models (Venue, Court, Booking, Payment, Lock, etc.)
    ├── services/
    │   ├── store.ts           # Storage repository with seed data & localStorage persistence
    │   ├── redisLockService.ts # Redis 5-min TTL slot lock engine
    │   ├── postgresEngine.ts  # PostgreSQL state machine & unique constraint enforcer
    │   ├── slotEngine.ts      # Dynamic slot calculator algorithm
    │   ├── razorpayService.ts # Razorpay order creation & idempotent webhook simulator
    │   ├── notificationService.ts # WhatsApp & SMS notification dispatch queue
    │   └── auditLogger.ts     # Admin action audit trail logger
    └── components/
        ├── customer/          # Customer-facing booking portal components
        │   ├── CustomerApp.tsx
        │   ├── SlotGrid.tsx
        │   ├── CheckoutModal.tsx
        │   ├── BookingConfirmationModal.tsx
        │   └── BookingLookupModal.tsx
        └── admin/             # Admin management portal components
            ├── AdminApp.tsx
            ├── ScheduleCalendarView.tsx
            ├── OfflineBookingModal.tsx
            ├── BookingListView.tsx
            ├── CourtPricingManager.tsx
            ├── CustomerCRM.tsx
            ├── ReportsAnalytics.tsx
            ├── AuditLogViewer.tsx
            └── SettingsPanel.tsx
```

---

## 🛠️ Database Schema Reference

| Table Name | Description | Key Fields |
|---|---|---|
| `venues` | Sports facility settings | `id`, `name`, `address`, `timezone`, `gst_number`, `min_notice_minutes` |
| `sports` | Supported sports | `id`, `name`, `icon` |
| `courts` | Playing grounds/fields | `id`, `venue_id`, `sport_ids`, `slot_duration_minutes`, `buffer_minutes`, `base_price_per_hour` |
| `pricing_rules` | Peak/off-peak rates | `id`, `court_id`, `day_type`, `start_time`, `end_time`, `price` |
| `customers` | Customer profiles | `id`, `name`, `phone`, `total_bookings`, `total_spent`, `no_show_count`, `is_blacklisted` |
| `admin_users` | Venue staff accounts | `id`, `name`, `email`, `role` (`owner` \| `manager` \| `staff`) |
| `bookings` | Customer & offline bookings | `id`, `booking_ref`, `customer_id`, `court_id`, `booking_date`, `start_time`, `source`, `status` |
| `payments` | Razorpay payment logs | `id`, `booking_id`, `gateway_order_id`, `gateway_payment_id`, `amount`, `status`, `method` |
| `slot_locks` | Redis TTL locks | `court_id`, `date`, `start_time`, `locked_by`, `expires_at` |
| `blocked_slots` | Maintenance/event blocks | `id`, `court_id`, `date`, `start_time`, `reason`, `created_by_admin_id` |
| `cancellation_policies` | Tiered refund rules | `id`, `hours_before_start`, `refund_percentage` |
| `coupons` | Promo discounts | `id`, `code`, `discount_type`, `value`, `min_amount` |
| `audit_log` | Security audit trail | `id`, `admin_user_id`, `action`, `entity_type`, `entity_id`, `created_at` |

---

## 📜 License
This project is proprietary software for sports venue management. All rights reserved.
