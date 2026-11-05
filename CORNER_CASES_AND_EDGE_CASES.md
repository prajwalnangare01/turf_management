# 🎯 TurfFlow — Master Corner Cases, Edge Cases & Use Cases Audit
> **Scope**: Site (Web Booking Portal) + Automation (WhatsApp n8n AI Agent) + Dashboard (Admin Operations) + Database (Supabase PostgreSQL & Realtime)  
> **Target Products**:  
> 1. *Product 1*: Full-Stack Tier (Site + WhatsApp Automation + Admin Dashboard)  
> 2. *Product 2*: Lean WhatsApp Tier (WhatsApp Automation + Admin Dashboard)

---

## 📌 Executive Summary

TurfFlow operates as a high-concurrency, multi-channel booking and venue management ecosystem. Because slots can be reserved simultaneously via **Customer Web Browsers**, **WhatsApp Conversational AI (n8n)**, and **Counter Front-Desk Walk-Ins**, maintaining 100% data integrity with zero double-bookings, accurate financial reporting, and seamless real-time synchronization is paramount.

This document details every identified user-side, automation, and admin-side corner case, failure mode, and operational use case, complete with risk analysis and concrete mitigation architectures.

---

## 1. 🌐 Customer Web Portal (Site)

### 1.1 Multi-Hour Consecutive Slot Booking Buffer Suppression
* **The Problem**: Courts often configure a `buffer_minutes` (e.g. 10 minutes turnover for pitch maintenance). If a customer books two consecutive 1-hour slots (e.g., 7:00 PM – 9:00 PM), a naive dynamic slot engine may inject a 10-minute gap between 8:00 PM and 8:10 PM, fragmenting the booking into disjoint periods.
* **Impact**: Customer gets an unnatural split booking; turf is unnecessarily locked out for 10 minutes during a continuous game.
* **Mitigation / Fix**:
  * In `SlotEngine.computeSlotsForCourt`, when computing contiguous blocks for the same booking transaction, suppress `buffer_minutes` between consecutive slots.
  * Only apply `buffer_minutes` at the termination of the *entire contiguous block*.

### 1.2 Timezone Drift & Client Device Clock Skew
* **The Problem**: A user accessing the booking portal from a smartphone or laptop with an inaccurate clock (e.g. 15 minutes slow), or set to a foreign timezone (e.g., UTC, PST), evaluates JavaScript `new Date()` against local device time.
* **Impact**: Slots in the past may show as available, or valid upcoming slots today may be prematurely disabled.
* **Mitigation / Fix**:
  * Never use the client machine's clock for date boundary enforcement.
  * Supply the current venue server timestamp in `Asia/Kolkata` (`+05:30`) via an initial API handshake or Supabase `now()` query.
  * Compute `isPast` and `min_notice_minutes` strictly against this server-provided clock.

### 1.3 Mobile Browser Tab Switching During UPI Payment
* **The Problem**: On mobile web, selecting UPI triggers an intent switch to an external app (Google Pay, PhonePe, Paytm). When the user returns to the browser, mobile Safari/Chrome often unloads or reloads background tabs.
* **Impact**: User loses the in-memory checkout state and believes their transaction failed, even if the bank debited money.
* **Mitigation / Fix**:
  * Persist pending checkout state (`booking_ref`, `slot_ids`, `expires_at`) in `sessionStorage` / `localStorage`.
  * On page mount/resume, check Supabase for the status of `booking_ref`. If the webhook already marked it `confirmed`, automatically display the **Booking Confirmation Modal** with the downloadable `.ics` calendar pass.

### 1.4 Phone Number Normalization & Blacklist Circumvention
* **The Problem**: A blacklisted customer (e.g., 3 no-shows) attempts to bypass restrictions by varying their phone number format: `9876543210`, `+919876543210`, `09876543210`, or `+91 98765-43210`.
* **Impact**: Blacklisted users continue to place reservations and trigger no-shows.
* **Mitigation / Fix**:
  * Implement an E.164 normalization pipe at the database input layer:
    ```typescript
    export function normalizeIndianPhone(input: string): string {
      const cleaned = input.replace(/\D/g, '');
      const last10 = cleaned.slice(-10);
      return `+91${last10}`;
    }
    ```
  * Enforce uniqueness on `customers.phone` using normalized 10-digit values.

### 1.5 Concurrency Race Condition on Promotional Coupons
* **The Problem**: A limited-edition promo code (e.g. `TURF100` limited to the first 50 users) is applied by 5 customers simultaneously when only 1 usage remains.
* **Impact**: The coupon usage count exceeds the venue's allotted promotional budget.
* **Mitigation / Fix**:
  * Enforce coupon decrement inside an atomic PostgreSQL / Supabase transaction:
    ```sql
    UPDATE coupons 
    SET used_count = used_count + 1 
    WHERE code = $1 AND used_count < usage_limit;
    ```
  * If rows affected = 0, reject checkout with *"Coupon usage limit exceeded"*.

---

## 2. 📱 WhatsApp Automation (n8n & Conversational AI Agent)

### 2.1 Stale Availability in Asynchronous Chats
* **The Problem**: A customer asks *"Are there slots for football tomorrow at 8 PM?"* at 2:00 PM. The agent checks and replies *"Yes, open!"*. The customer goes offline and replies at 2:45 PM: *"Book it"*. In the intervening 45 minutes, a website user booked that exact slot.
* **Impact**: Without re-validation, the agent attempts to book an already occupied slot or gives false confirmation.
* **Mitigation / Fix**:
  * The booking tool (`lock_and_book_slot`) must execute an atomic availability check and lock acquisition **at the exact instant** the user requests the reservation.
  * If the slot was taken while the user was away, the agent gracefully informs them: *"Sorry! That slot was reserved while we were chatting. Here are the remaining open times for tomorrow: [List]"*.

### 2.2 Accidental Immediate Cancellation
* **The Problem**: A customer messages *"What if I cancel my booking TRF-20261105-1001?"* or *"Can I cancel?"*. An overly eager AI agent might immediately invoke the cancellation tool.
* **Impact**: Booking is terminated without explicit customer consent, potentially applying non-refundable penalties.
* **Mitigation / Fix**:
  * Enforce a mandatory **Two-Step Confirmation Guardrail** in the agent's system prompt:
    1. Calculate and display policy refund terms first:  
       *"As per venue policy, cancelling booking `TRF-20261105-1001` now entitles you to a ₹900 refund (50% tier). Do you confirm? Reply 'CONFIRM CANCEL' to proceed."*
    2. Only execute `cancel_booking` upon receiving explicit affirmative confirmation.

### 2.3 Indian Time Parsing & Conversational Ambiguity
* **The Problem**: Players write colloquial requests: *"Kal shaam 7 baje"*, *"Friday 8pm cricket"*, *"Book for 7"*.
* **Impact**: "7" could be misparsed as 07:00 AM (early morning) rather than 19:00 (evening peak).
* **Mitigation / Fix**:
  * The date/time parsing layer defaults standalone hours between `5` and `11` to `PM` (17:00 – 23:00) since >85% of turf traffic occurs under floodlights.
  * In the response message, the agent must explicitly restate the 12-hour and 24-hour time to avoid misunderstandings: *"Reserving 7:00 PM (19:00 evening)"*.

### 2.4 Rapid-Fire Fragmented Messages (Debounce Protection)
* **The Problem**: Users on WhatsApp frequently send thoughts across multiple short messages:  
  *Message 1 (00:00)*: "Bro"  
  *Message 2 (00:01)*: "Need turf"  
  *Message 3 (00:02)*: "Tomorrow 8pm"  
  *Message 4 (00:03)*: "Turf A football"
* **Impact**: Triggering the n8n webhook 4 times in 3 seconds causes 4 simultaneous LLM executions, race conditions, and duplicated replies.
* **Mitigation / Fix**:
  * Implement an inbound **Message Buffer / Debounce Node** in n8n (or Redis queue) with a 2.5-second debounce window.
  * Concatenate incoming text from the same sender phone number before handing off to the LangChain AI Agent.

### 2.5 Abandoned Checkout Hold Recovery (Smart Re-engagement)
* **The Problem**: Customer requests a slot, agent locks it for 5 minutes and sends the Razorpay payment link. Customer gets distracted and never pays.
* **Impact**: Slot sits blocked for 5 minutes and is then released, with the venue losing the sale.
* **Mitigation / Fix**:
  * Set up a scheduled n8n cron (`05_Abandoned_Checkout_Nudge.json`):
  * At minute 6 (1 minute after lock release), if booking remains `pending_payment`, send a polite nudge:  
    *"Hey! Your 5-minute hold on Turf A (8:00 PM) expired. Would you like us to hold it for another 5 minutes, or check a different time?"*.

---

## 3. 🛡️ Admin Dashboard & Venue Front-Desk

### 3.1 Counter Sales Collision with Active Web/WhatsApp Checkout Hold
* **The Problem**: A customer is physically standing at the venue reception counter paying cash. Staff opens the Offline Booking modal to book 8:00 PM. Simultaneously, a WhatsApp customer has just been sent a payment link, placing a 5-minute lock on that slot.
* **Impact**: Staff is blocked by the lock or accidentally creates a duplicate booking.
* **Mitigation / Fix**:
  * When staff selects a slot held under an active 5-minute lock, display an **Active Customer Hold Warning**:
    > ⚠️ **Slot Held in Online/WhatsApp Checkout**  
    > Customer Phone: `+91 98765 XXXXX`  
    > Hold Expires in: `03:42`
  * Provide an authenticated **"Manager Override & Confirm Cash Booking"** button. If exercised, the system cancels the pending online checkout hold and notifies the WhatsApp user: *"Sorry, this slot was just booked at the venue counter"*.

### 3.2 Sudden Weather Disruption / Rainout Mass Cancellation
* **The Problem**: Heavy rainfall or lightning floods an outdoor synthetic pitch at 4:30 PM. All 6 evening matches (5:00 PM – 11:00 PM) must be cancelled immediately.
* **Impact**: Staff must manually open 6 individual booking drawers, issue refunds one by one, and call/message each team.
* **Mitigation / Fix**:
  * Implement an Admin **"Emergency Weather Block & Mass Refund"** tool:
    1. Select Court, Date, and Time Window (e.g. 17:00 – 23:00).
    2. System auto-cancels all affected confirmed bookings.
    3. Auto-initiates 100% full refunds via Razorpay API (bypassing normal cancellation notice penalties).
    4. Auto-dispatches an emergency weather cancellation alert over WhatsApp to all affected team captains simultaneously.

### 3.3 Admin Blocking an Already Confirmed Slot
* **The Problem**: Turf manager attempts to schedule pitch maintenance or private owner practice from 6:00 PM to 8:00 PM, unaware that a customer already has a confirmed booking from 7:00 PM to 8:00 PM.
* **Impact**: Database unique conflict or physical double-booking on match day.
* **Mitigation / Fix**:
  * Intercept the `blocked_slots` insertion: query `bookings` for any active reservations (`pending_payment` or `confirmed`) overlapping the block interval.
  * If conflicts exist, reject creation with a prompt: *"Cannot block court: Active booking TRF-20261105-1001 exists. Please reschedule or refund this booking first."*

### 3.4 Multi-Tender Split Payment Recording at Front Desk
* **The Problem**: A walk-in corporate booking costs ₹3,600 (2 hours). The customer pays ₹2,000 in physical cash and ₹1,600 via UPI QR code at the desk.
* **Impact**: Admin cash drawer balances don't match the bank settlement, causing accounting discrepancies.
* **Mitigation / Fix**:
  * In `OfflineBookingModal`, allow splitting payment into multiple methods:
    * `Cash`: ₹2,000
    * `UPI / QR`: ₹1,600
  * Store breakdown in `payments` table with `method: 'split'` and a structured JSON breakdown.

### 3.5 Role-Based Authorization Safeguards (RBAC)
* **The Problem**: Temporary night-shift counter staff possesses access to the dashboard.
* **Impact**: Unauthorized staff members edit court pricing, alter cancellation policies, or issue manual cash refunds to acquaintances.
* **Mitigation / Fix**:
  * Enforce strict role hierarchy:
    * `Staff`: Counter Walk-In bookings, Check-in status updates (`completed`, `no_show`), Calendar view.
    * `Manager`: Schedule blocks, Rescheduling, Manual refunds up to ₹2,000.
    * `Owner`: Full access, Pricing rule changes, Cancellation policy configuration, Customer blacklist toggles, Revenue analytics CSV export.

---

## 4. 💳 Payments, Supabase Database & Realtime Synchronization

### 4.1 Razorpay Webhook Idempotency (Duplicate Delivery Protection)
* **The Problem**: Payment gateways (Razorpay, Stripe) retry webhook deliveries up to 5 times if their server receives a temporary timeout or delayed 200 OK.
* **Impact**: Duplicate webhooks could trigger multiple confirmation messages, double-increment customer spend metrics (`total_spent`), or trigger accounting chaos.
* **Mitigation / Fix**:
  * Make webhook processing strictly idempotent:
    ```typescript
    const existingPayment = await supabase
      .from('payments')
      .select('id, status')
      .eq('gateway_payment_id', paymentId)
      .single();

    if (existingPayment && existingPayment.status === 'captured') {
      return res.status(200).json({ status: 'already_processed' });
    }
    ```
  * Only transition status from `pending_payment` to `confirmed` once.

### 4.2 Payment Captured After 5-Minute Slot Lock Expiration
* **The Problem**: A customer opens the Razorpay link at minute 4:45. Due to bank OTP delays or slow network, payment capture succeeds at minute 6:15. In the meantime, the 5-minute lock expired, and another customer reserved that slot.
* **Impact**: The database unique constraint rejects the second booking, but Razorpay has already charged the customer's card/UPI!
* **Mitigation / Fix**:
  * In the webhook handler, inspect if the slot was re-booked during the delay:
    * **Scenario A (Slot still open)**: Confirm booking immediately.
    * **Scenario B (Slot taken by someone else)**: Auto-transition booking to `conflict_refund_pending`. Automatically call Razorpay Refund API (`/v1/payments/{payment_id}/refund`) for an instant 100% refund, and notify the customer via WhatsApp:  
      *"⚠️ Your payment was received after the 5-minute reservation window expired and the slot was taken. An automatic 100% refund of ₹X has been credited back to your account."*

### 4.3 Midnight Operating Hours Crossover
* **The Problem**: Multi-sport venues frequently operate late into the night (e.g., Opening `06:00 AM` to Closing `02:00 AM` next morning).
* **Impact**: A naive time comparison (`closeMins - openMins`) produces a negative duration, causing the slot generator to crash or omit late-night slots.
* **Mitigation / Fix**:
  * If `closing_time < opening_time`, treat `closing_time` as `closing_time + 24 hours` (1440 minutes).
  * Slots beginning after 23:59 are tagged with `booking_date = target_date + 1 day` with correct sequential ordering.

### 4.4 Supabase Realtime Reconnection & Network Drops
* **The Problem**: Reception counter tablet experiences intermittent Wi-Fi drops (e.g. tablet goes to sleep).
* **Impact**: WebSocket events fired during the disconnection are missed, leaving the calendar matrix out of sync.
* **Mitigation / Fix**:
  * Implement heartbeat & reconnect listener on the Supabase client:
    ```typescript
    supabase.channel('bookings-sync')
      .on('system', { event: 'reconnect' }, () => {
        // Re-fetch entire day's bookings to guarantee zero desync
        refreshCurrentViewBookings();
      })
      .subscribe();
    ```

---

## 📋 Comprehensive Corner Cases Matrix

| Area | ID | Corner Case | Severity | System Handling |
| :--- | :---: | :--- | :---: | :--- |
| **Site** | `CC-S01` | Consecutive multi-hour booking buffer gap | Medium | Suppress turnover buffer between consecutive hours by same customer |
| **Site** | `CC-S02` | Client device clock skew / foreign timezone | High | Evaluate past slots strictly against server `Asia/Kolkata` clock |
| **Site** | `CC-S03` | Mobile tab unload during UPI app redirect | High | Persist pending ref in `sessionStorage` & poll on resume |
| **Site** | `CC-S04` | Phone number formatting blacklist bypass | High | E.164 normalization pipe (`+91` + 10 digits) |
| **Site** | `CC-S05` | Coupon limit concurrency exhaustion | Medium | Atomic Postgres SQL decrement with row-level lock |
| **Automation**| `CC-A01` | Stale slot availability in async chat | Critical | Always re-verify availability & acquire lock upon booking intent |
| **Automation**| `CC-A02` | Accidental instant cancellation without confirmation | High | Mandatory 2-step confirmation with refund preview |
| **Automation**| `CC-A03` | Ambiguous time ("kal 7 baje") | Medium | Default 5-11 to PM + explicit 12h/24h time confirmation |
| **Automation**| `CC-A04` | Rapid-fire fragmented WhatsApp messages | Medium | 2.5-second debounce buffer before calling LLM agent |
| **Automation**| `CC-A05` | Abandoned checkout hold follow-up | Low | 6th-minute nudge workflow via n8n |
| **Dashboard** | `CC-D01` | Counter walk-in vs active WhatsApp lock collision | Critical | Active hold warning modal with authenticated Manager Override |
| **Dashboard** | `CC-D02` | Rainout / floodlight outage mass cancellation | High | One-click mass cancel + 100% refund + mass WhatsApp dispatch |
| **Dashboard** | `CC-D03` | Blocking a court that has active confirmed bookings | High | Conflict detection query blocking creation until resolved |
| **Dashboard** | `CC-D04` | Multi-tender split cash/UPI payment at counter | Medium | Structured split payment ledger recording |
| **Dashboard** | `CC-D05` | Unauthorized staff modifying prices or ledger | High | Role-Based Access Control (RBAC) on sensitive actions |
| **Payments**  | `CC-P01` | Duplicate Razorpay webhook deliveries | Critical | Strict idempotency via `gateway_payment_id` check |
| **Payments**  | `CC-P02` | Payment captured after 5-min lock expiry on taken slot | Critical | Auto-conflict detection with automated 100% instant refund |
| **Database**  | `CC-DB1` | Midnight operating hours crossover (06:00 - 02:00) | Medium | Modular 24h+ minute arithmetic with date increment |
| **Database**  | `CC-DB2` | Supabase Realtime reconnection packet loss | High | Automatic state re-fetch on WebSocket reconnect |

---

## 🚀 Recommended Implementation Phases

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Critical Financial & Booking Safety (Week 1)  │
├────────────────────────────────────────────────────────┤
│ • CC-P01: Webhook idempotency protection               │
│ • CC-P02: Late payment collision automated refund      │
│ • CC-A01: Real-time slot re-check prior to payment link│
│ • CC-A02: Two-step WhatsApp cancellation confirmation  │
│ • CC-D01: Admin lock collision warning & override      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ Phase 2: Operational Smoothness & UX (Week 2)          │
├────────────────────────────────────────────────────────┤
│ • CC-S01: Consecutive multi-hour buffer suppression    │
│ • CC-S02: Server-side timezone enforcement (Asia/Kol)  │
│ • CC-S04: E.164 phone normalization pipe               │
│ • CC-D02: Emergency weather mass cancellation tool     │
│ • CC-D03: Confirmed slot override guard on blocks      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ Phase 3: Edge Polishing & Scale (Week 3)               │
├────────────────────────────────────────────────────────┤
│ • CC-A04: WhatsApp message debouncing in n8n           │
│ • CC-A05: Abandoned checkout recovery automation       │
│ • CC-D04: Multi-tender split payments ledger           │
│ • CC-DB1: Midnight operating hours crossover support   │
│ • CC-DB2: Supabase Realtime reconnection sync          │
└────────────────────────────────────────────────────────┘
```
