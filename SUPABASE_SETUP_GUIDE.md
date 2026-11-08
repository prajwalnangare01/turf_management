# 🗄️ Supabase Database Setup & Synchronization Guide
### Multi-Channel Realtime Sync for TurfFlow (Website + WhatsApp AI Agent + Admin Portal)

This guide walks you through setting up and synchronizing the **Supabase PostgreSQL Database** so that booking requests, slot availability, concurrency locks, and customer profiles remain **100% synchronized in real time** across your **Customer Website** and **WhatsApp Conversational AI Engine**.

---

## 🏗️ Synchronization Architecture

```
                          ┌─────────────────────────────────────┐
                          │     Supabase PostgreSQL Cloud      │
                          │   (Single Source of Truth / DB)     │
                          └──────┬──────────────────────┬───────┘
                                 │                      │
             Supabase Realtime   │                      │  Supabase Realtime
             WebSocket Broadcast │                      │  WebSocket Broadcast
                                 ▼                      ▼
        ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
        │        Customer Web Portal       │   │   WhatsApp Automation Server     │
        │      (React + Vite + Tailwind)   │   │   (Node.js + Express + n8n/AI)   │
        └──────────────────────────────────┘   └──────────────────────────────────┘
```

### 🔒 Dual-Layer Concurrency Defense
1. **Layer 1 (Temporary 5-Minute Slot Hold)**: When a customer selects a slot on the website or asks the WhatsApp AI bot (*"Book Turf A tomorrow at 8pm"*), a 5-minute checkout lock is created. Both the website and WhatsApp see this hold instantly and prevent other users from selecting it.
2. **Layer 2 (PostgreSQL Unique Partial Index)**: The database enforces:
   ```sql
   CREATE UNIQUE INDEX unique_active_booking 
   ON bookings (court_id, booking_date, start_time) 
   WHERE status IN ('pending_payment', 'confirmed');
   ```
   Zero double-bookings can ever be committed to the database.

---

## 🚀 Step 1: Create Your Supabase Project

1. Log into your account at **[https://supabase.com](https://supabase.com)** (free tier works great).
2. Click **New Project**.
3. Choose your organization, set project name (e.g. `turfflow-arena`), choose database password, and pick the region closest to your venue (e.g., `ap-south-1` Mumbai, India).
4. Wait 1-2 minutes for Supabase to provision your database.

---

## ⚡ Step 2: Execute Schema & Realtime Setup (1-Click SQL)

We have provided a comprehensive, ready-to-run SQL script [`supabase_setup.sql`](file:///supabase_setup.sql) in your project root.

1. In your Supabase Dashboard, click on **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Open [`supabase_setup.sql`](file:///supabase_setup.sql) from this repository, copy its entire contents, and paste into the Supabase SQL editor.
4. Click **Run** (or `Ctrl+Enter` / `Cmd+Enter`).

### What this setup creates:
- ✅ **15 Synchronized Tables**: `venues`, `sports`, `courts`, `court_sports`, `pricing_rules`, `customers`, `admin_users`, `bookings`, `payments`, `blocked_slots`, `slot_locks`, `cancellation_policies`, `coupons`, `notifications_log`, `audit_log`.
- ✅ **Supabase Realtime Publication**: Enables WebSocket change broadcasts on `bookings`, `customers`, `payments`, `courts`, `blocked_slots`, and `slot_locks`.
- ✅ **Row Level Security (RLS)**: Pre-configured permissive policies for public customer reservations (`anon` key) and backend services (`service_role` key).
- ✅ **Layer-2 Concurrency Protection**: Partial unique index `unique_active_booking` protecting against race conditions.
- ✅ **Initial Venue Seed Data**: Pre-populates venue (*TurfFlow Arena*), sports (*Football, Cricket, Badminton, Pickleball*), 3 courts, peak evening rates, and default admin credentials.

---

## 🔑 Step 3: Configure Environment Variables

1. In your Supabase Dashboard, navigate to **Project Settings** (gear icon) ➔ **API**.
2. Copy the following:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **Project API Keys ➔ `anon` `public`** key (e.g., `eyJhbGciOi...`)
   - **Project API Keys ➔ `service_role` `secret`** key
3. In your local project root, open `.env` and fill in:

```ini
# Supabase PostgreSQL Database & Realtime Synchronization
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key

# Frontend Vite Variables (Used by React Web Portal)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# PostgreSQL Connection String (Found under Project Settings -> Database -> URI)
DATABASE_URL=postgresql://postgres.your-ref:your_password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require
```

> 💡 **No restart needed!** You can also configure Supabase directly from the Admin UI:
> Go to **Admin Dashboard** ➔ **Settings** ➔ **Supabase PostgreSQL & Realtime Synchronization**, paste your URL and Anon Key, and click **"Save Credentials & Connect"**!

---

## 🧪 Step 4: Verify Multi-Channel Synchronization

### Test 1: Web Portal ➔ WhatsApp Bot Sync
1. Open your web app at `http://localhost:5173`.
2. Select **Turf A** for tomorrow at **08:00 PM**, complete the checkout, and confirm the booking.
3. In WhatsApp (or the WhatsApp Simulator at `http://localhost:5000/simulator`), send:
   > *"Show available slots for Turf A tomorrow"*
4. **Observation**: The 08:00 PM slot will be shown as **already booked**! If the user tries to type *"Book Turf A tomorrow at 8pm"*, the AI agent responds with `booking_conflict` and offers alternative available timings!

### Test 2: WhatsApp Bot ➔ Web Portal Realtime Sync
1. In WhatsApp (or the Simulator), send:
   > *"Book Turf B tomorrow at 7pm"*
2. Keep the website open on `http://localhost:5173` on the calendar or slot grid.
3. Confirm the payment on WhatsApp.
4. **Observation**: Without refreshing the browser, the web calendar matrix and customer list instantly update in real time via Supabase WebSocket!

---

## 🛠️ CLI Database Migration (Alternative Method)

If you prefer applying database migrations and seed data directly via Node.js CLI:

```bash
cd whatsapp-automation/server
npm run migrate
```

This runs `scripts/supabase-migrate.js`, connects directly to your PostgreSQL database, executes the schema DDL, installs the unique index, verifies Realtime publications, and outputs a table status summary.
