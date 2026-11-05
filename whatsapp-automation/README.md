# ⚽ TurfFlow WhatsApp Automation & AI Agent Suite

A production-ready WhatsApp Conversational AI Booking Engine & n8n Workflow suite for **TurfFlow**. Powers both:
1. **Product 1: Full-Stack Tier** *(Web Portal + WhatsApp Automation + Admin Dashboard)*
2. **Product 2: Lean WhatsApp Tier** *(WhatsApp Automation + Admin Dashboard — Zero customer website required)*

---

## 🌟 Capabilities & Features

- 🤖 **24/7 Conversational AI Concierge**: Understands natural language queries, dates ("tomorrow", "kal shaam", "Friday evening"), and sports.
- ⚡ **Real-Time Dynamic Slot Engine**: Computes available slots factoring operating hours, buffer turnover minutes, weekday vs weekend pricing, and evening peak surcharges.
- 🔒 **Dual-Layer Concurrency Control**:
  - **Layer 1**: 5-minute temporary checkout lock preventing race conditions between WhatsApp and web users.
  - **Layer 2**: Database unique constraint enforcing zero double-bookings.
- 💳 **Razorpay Payment Processing**: Automatic payment link & UPI intent generation, HMAC webhook verification, and instant confirmation pass.
- 📋 **Customer Self-Service**: Check active bookings, lookup history by phone number or booking reference code.
- 🔄 **Automated Tiered Cancellation Policy**:
  - `> 24 hours` before match: **100% refund**
  - `6 to 24 hours` before match: **50% refund**
  - `< 6 hours` before match: **0% refund**
- ⏰ **Outbound Notification Workflows (n8n)**:
  - 🎟️ Instant WhatsApp ticket confirmation card with Google Maps pin.
  - ⏰ 2-hour pre-match reminders.
  - ⭐ Post-match player review & feedback automation.
- 📱 **Interactive Web Simulator**: Live WhatsApp mobile interface to test the AI agent, observe concurrency locks, and simulate payment captures in your browser!

---

## 📂 Project Structure

```
whatsapp-automation/
├── agent-spec/
│   └── agent-system-prompt.md            # Master system prompt with guardrails & few-shot examples
├── docs/
│   ├── N8N_SETUP_GUIDE.md               # Guide to importing & running workflows in n8n
│   ├── PRODUCT_ARCHITECTURE.md          # Multi-tier Product 1 vs Product 2 architecture
│   └── WHATSAPP_INTEGRATION_GUIDE.md    # Meta Cloud API, Evolution API & Twilio setup
├── n8n-workflows/
│   ├── 01_TurfFlow_WhatsApp_AI_Agent_Master.json            # Master conversational agent workflow
│   ├── 02_Razorpay_Payment_Success_Notification.json        # Payment capture to WhatsApp pass
│   ├── 03_Match_Day_Reminder_Cron.json                     # 2-hour pre-game reminder cron
│   └── 04_Post_Match_Review_Feedback.json                  # 1-hour post-game feedback cron
├── server/
│   ├── package.json
│   ├── tests/
│   │   └── api.test.js                  # Comprehensive 7-test suite
│   └── src/
│       ├── data/store.js                # Shared venue, court, and booking state
│       ├── routes/
│       │   ├── apiRoutes.js             # REST API for n8n tools & web portal
│       │   └── webhookRoutes.js         # Razorpay & Meta WhatsApp webhooks
│       ├── services/
│       │   ├── aiAgentService.js        # Natural language understanding & dialog manager
│       │   ├── bookingService.js        # Booking lifecycle & cancellation engine
│       │   ├── lockService.js           # 5-minute TTL slot lock manager
│       │   ├── notificationService.js   # WhatsApp dispatch logger & card formatter
│       │   ├── razorpayService.js       # Payment link generator & signature verifier
│       │   └── slotEngine.js            # Dynamic slot calculator
│       ├── utils/
│       │   └── whatsappFormatter.js     # WhatsApp markdown & Meta interactive payloads
│       └── server.js                    # Express application entry point
└── simulator/
    └── index.html                       # Real-time interactive WhatsApp testing playground
```

---

## 🚀 Quick Start (Run & Test Locally)

### 1. Install & Run the Test Suite
```bash
cd whatsapp-automation/server
npm install
npm test
```
All 7 integration test suites will execute (Dynamic slot calculation, concurrency locking, booking initiation, payment confirmation, customer lookup, cancellation refund, and AI agent understanding).

### 2. Launch Backend & Live Simulator
```bash
npm start
```

Now open:
👉 **`http://localhost:5000/simulator`**

You will see the **TurfFlow WhatsApp Playground**:
- Chat with the AI Agent in the phone mockup.
- Watch active 5-minute checkout locks update in real-time.
- View new bookings appear in the database table with source `offline_whatsapp`.
- Click **"Simulate Pay"** to trigger payment capture and watch the confirmed WhatsApp pass dispatch immediately!

---

## ⚡ Connecting to n8n

Follow [`docs/N8N_SETUP_GUIDE.md`](file:///whatsapp-automation/docs/N8N_SETUP_GUIDE.md) to import `01_TurfFlow_WhatsApp_AI_Agent_Master.json` into your n8n workspace.
The n8n AI Agent calls the backend tools (`/api/slots`, `/api/bookings/initiate`, `/api/bookings/lookup`, `/api/bookings/cancel`, `/api/venue`) and responds back to your WhatsApp Business Cloud API number!
