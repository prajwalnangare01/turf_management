# 🏗️ TurfFlow Product Architecture: Multi-Tier Strategy

This document outlines the architecture for delivering **TurfFlow** as two distinct commercial product tiers while sharing a unified database schema, slot engine, concurrency lock layer, and admin management dashboard.

---

## 📦 The Two Product Offerings

| Feature / Capability | **Product 1: Full-Stack Tier**<br/>*(Site + WhatsApp + Admin)* | **Product 2: Lean WhatsApp Tier**<br/>*(WhatsApp + Admin)* |
| :--- | :---: | :---: |
| **Target Customers** | Modern sports clubs, multi-facility arenas, high-volume venues wanting both website bookings and WhatsApp automation | Independent turf owners, local community grounds where 90%+ customers prefer chatting directly on WhatsApp |
| **Customer Web Portal** | ✅ React/Vite customer portal with slot grid, sport selector, phone OTP, and online checkout | ❌ *None required*. Customers interact 100% through WhatsApp conversational AI |
| **WhatsApp AI Agent (n8n)** | ✅ AI booking concierge, check availability, payments, reminders | ✅ Primary customer interface for all bookings, queries & tickets |
| **Dual-Layer Concurrency** | ✅ Redis 5-min TTL lock + DB Unique Partial Index | ✅ Redis 5-min TTL lock + DB Unique Partial Index |
| **Admin Operations Portal** | ✅ High-density schedule matrix, walk-in counter sales, CRM, analytics | ✅ High-density schedule matrix, walk-in counter sales, CRM, analytics |
| **Razorpay Payments** | ✅ Embedded Web SDK + UPI Payment Links | ✅ Dynamic WhatsApp Payment Links & UPI QR intents |
| **Outbound Automations** | ✅ Confirmation cards, 2h match reminders, post-match feedback | ✅ Confirmation cards, 2h match reminders, post-match feedback |

---

## 🔄 Dual-Layer Concurrency Control (Zero Double-Bookings)

In both Product 1 and Product 2, preventing double-bookings is critical.

```
       [ Customer on Web Portal ]                   [ Player on WhatsApp ]
                   │                                          │
                   ▼                                          ▼
     [ Step 1: Select Slot on Web ]             [ Step 1: "Book Turf A at 8pm" ]
                   │                                          │
                   └───────────────────┬──────────────────────┘
                                       ▼
                     ┌────────────────────────────────────┐
                     │   Layer 1: Concurrency Lock Engine │
                     │   Redis: lock:{court}:{date}:{time}│
                     │   TTL: 300 seconds (5 minutes)     │
                     └─────────────────┬──────────────────┘
                                       │ (Slot Locked for 5 mins)
                                       ▼
                     ┌────────────────────────────────────┐
                     │   Pending Booking Inserted         │
                     │   Status: pending_payment          │
                     │   Source: 'online' or 'offline_wa' │
                     └─────────────────┬──────────────────┘
                                       │
                                       ▼
                     ┌────────────────────────────────────┐
                     │   Razorpay Payment Order / Link    │
                     └─────────────────┬──────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                  [ Payment Fails /          [ Payment Captured /
                    Timeout 5 Mins ]           Webhook Verified ]
                          │                         │
                          ▼                         ▼
                  Lock Released            ┌───────────────────────────────┐
                  Slot restored to         │ Layer 2: Postgres Unique Index│
                  'available'              │ Status -> 'confirmed'         │
                                           │ Lock Released                 │
                                           │ Instant WhatsApp Pass Sent    │
                                           └───────────────────────────────┘
```

1. **Layer 1 — Redis / In-Memory Lock (5-min TTL)**:
   - When a WhatsApp user initiates a reservation, the server executes:
     `SET lock:{court_id}:{booking_date}:{start_time} {phone_number} NX EX 300`
   - If a customer on the web site tries to pick the same slot during those 5 minutes, the slot shows as **"Locked"** with a live countdown timer.
   - If a venue manager opens the Admin Counter Walk-In modal, a warning banner appears: *"Slot currently held by WhatsApp user (+91 XXXXX XXXXX)"*.

2. **Layer 2 — PostgreSQL Partial Unique Index**:
   ```sql
   CREATE UNIQUE INDEX unique_active_booking 
   ON bookings (court_id, booking_date, start_time) 
   WHERE status IN ('pending_payment', 'confirmed');
   ```
   - Serves as the ultimate source of truth, guaranteeing zero collision even under high concurrency.

---

## 🗄️ Unified Database Model

Both products operate over the exact same PostgreSQL schema (`schema.sql`):
- `venues`: Venue hours, notice windows, address, rules.
- `courts`: Court names, sports supported, slot duration, buffer turnover time, base rates, weekend rates, peak rates.
- `bookings`:
  - `source`: `'online'`, `'offline_whatsapp'`, `'offline_phone'`, `'offline_walkin'`.
  - `status`: `'pending_payment'`, `'confirmed'`, `'completed'`, `'cancelled'`, `'refunded'`, `'no_show'`.
- `customers`: Tracks total bookings, total revenue, no-show counters, and blacklist status across both web and WhatsApp channels.

---

## 📊 Admin Dashboard Experience

Venue managers and front-desk staff use the same Admin Dashboard for both products:
1. **Schedule Calendar Matrix**: WhatsApp bookings appear in real-time with a distinct badge: `source: offline_whatsapp`.
2. **Booking Detail Drawer**: Staff can view the customer's phone number, paid amount via Razorpay, and trigger manual rescheduling or cancellation if the customer calls the venue.
3. **Audit Trail**: Every action taken by the WhatsApp agent (lock acquired, booking initiated, booking confirmed, booking cancelled) is logged with timestamp and entity diff.
