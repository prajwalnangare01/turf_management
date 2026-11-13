# 🚀 Deploying TurfFlow & WhatsApp Automation on Render

This guide walks you through deploying the complete **TurfFlow Multi-Channel Booking Platform** (React Web App, Express API, Razorpay Gateway, and WhatsApp Multi-Device AI Agent) to **Render.com**.

---

## 🏗️ 1. Architecture on Render

TurfFlow is designed with a **Unified Single-Service Architecture**:
* **Frontend**: React + Vite + Tailwind is compiled into `dist/` and served directly by the Express server.
* **Backend API & Webhooks**: Express handles `/api/*` and Razorpay webhooks (`/api/webhooks/razorpay`).
* **WhatsApp Automation**: Uses `@whiskeysockets/baileys` to maintain an active multi-device WebSocket connection to WhatsApp servers directly within the Node.js process.

```
                  ┌──────────────────────────────────────────────┐
                  │              RENDER WEB SERVICE              │
                  │                                              │
Internet  ───────►│  Express Server (Port 10000 / $PORT)        │
                  │  ├── /           -> React Frontend (dist/)   │
                  │  ├── /api        -> REST API & Auth          │
                  │  ├── /pay/:ref   -> Razorpay Payment Gateway │
                  │  └── Baileys     -> WhatsApp WebSocket Agent │
                  └──────┬───────────────────────┬───────────────┘
                         │                       │
                         ▼                       ▼
               ┌──────────────────┐    ┌──────────────────┐
               │ RENDER DISK      │    │ SUPABASE POSTGRES│
               │ /var/data/       │    │ + REDIS CACHE    │
               │ whatsapp_session │    │ (Cloud Database) │
               └──────────────────┘    └──────────────────┘
```

---

## ⚡ 2. Quick Deploy Options

### Option A: Automatic Blueprint via `render.yaml` (Recommended)

1. Push this repository to **GitHub** or **GitLab**.
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** ➔ **Blueprint**.
4. Connect your TurfFlow repository. Render will automatically detect [`render.yaml`](./render.yaml).
5. Render will automatically pre-configure the Web Service, Persistent Disk, and Environment Variables.
6. Fill in your secrets (Supabase, Razorpay, Gmail SMTP, WhatsApp Phone Number) and click **Apply**.

---

### Option B: Manual Web Service Setup on Render

If you prefer setting it up manually from the Render dashboard:

1. Click **New +** ➔ **Web Service**.
2. Connect your Git repository.
3. Configure the settings:
   * **Name**: `turfflow-platform`
   * **Region**: `Singapore` (Recommended for lowest latency to India)
   * **Branch**: `main`
   * **Runtime**: `Node`
   * **Build Command**:
     ```bash
     npm install && npm run build && cd whatsapp-automation/server && npm install
     ```
   * **Start Command**:
     ```bash
     node whatsapp-automation/server/src/server.js
     ```
   * **Instance Type**:
     * **Free** (or Starter $7/mo): **Supabase PostgreSQL Session Persistence ($0 Disk Cost)** allows you to run on stateless / ephemeral containers without a paid Render persistent disk. When the container boots, it automatically hydrates the WhatsApp session from Supabase! For 24/7 instant WhatsApp responses without sleep delays, the **Starter** plan is recommended.

4. **Persistent Storage ($0 with Supabase)**:
   * **No Render disk required!** The WhatsApp session state (`creds.json` and cryptographic keys) is automatically synchronized to the `whatsapp_sessions` table in Supabase PostgreSQL.
   * `WHATSAPP_SESSION_PATH` defaults to `/tmp/whatsapp_session`.

---

## 📱 3. WhatsApp Automation Deployment & Supabase Persistence

Because WhatsApp Multi-Device connects to WhatsApp servers via an active WebSocket protocol, session persistence is handled seamlessly:

### How $0 Supabase PostgreSQL Session Persistence Works
When your phone pairs with WhatsApp (via QR or Pairing Code), Baileys generates encrypted cryptographic keys (`creds.json`, pre-keys, session keys).
* **Automatic Cloud Backup**: `WhatsAppSessionStore` automatically serializes binary buffers using `BufferJSON` and syncs them to your Supabase PostgreSQL database (`whatsapp_sessions` table).
* **Automatic Boot Hydration**: On container boot (even after Render free tier spins down or during redeployments), the server automatically queries Supabase and restores the entire session into `/tmp/whatsapp_session`.
* **Zero Re-pairing**: You only scan or pair **once**. Even if the container is destroyed and recreated, the bot reconnects automatically as authenticated!

### How to Pair Your WhatsApp Phone Number
Once your service is deployed on Render:

#### Method 1: Using the 8-Digit Pairing Code (Recommended - No Camera Needed)
1. In Render environment variables, ensure `WHATSAPP_PHONE_NUMBER` is set to your 10-digit WhatsApp number (e.g. `9579158374` or `919579158374`).
2. When the server boots, view the **Render Live Logs**.
3. You will see a banner:
   ```text
   ======================================================
   🔑 FRESH WHATSAPP PAIRING CODE:  ABCD-1234
   📱 TARGET PHONE NUMBER:          +919579158374
   ======================================================
   ```
4. Open WhatsApp on your phone ➔ **Settings** ➔ **Linked Devices** ➔ **Link a Device** ➔ Tap **Link with phone number instead** ➔ Enter the 8-digit code shown in the logs.
5. Within 3 seconds, the terminal logs will show:
   ```text
   🎉 [WHATSAPP AGENT ONLINE]: Successfully connected as +919579158374!
   ```

#### Method 2: From the TurfFlow Admin Dashboard
1. Open your deployed website: `https://your-app.onrender.com/admin`
2. Log in with your admin credentials.
3. Open the **WhatsApp Manager** tab.
4. Enter your phone number and click **Generate Pairing Code** or scan the live QR code rendered on the screen.

---

## 🔑 4. Complete Environment Variables Checklist

Add these environment variables in your Render Web Service dashboard under **Environment**:

| Variable Name | Required | Example / Description |
|---|---|---|
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | **Yes** | `10000` (Render's internal port) |
| `CLIENT_URL` | **Yes** | `https://your-app.onrender.com` (Your live domain) |
| `BASE_URL` | **Yes** | `https://your-app.onrender.com` |
| `WHATSAPP_SESSION_PATH`| **Yes** | `/var/data/whatsapp_session` (Points to persistent disk) |
| `WHATSAPP_PHONE_NUMBER`| **Yes** | `9579158374` (Venue WhatsApp Business / SIM phone) |
| `JWT_SECRET` | **Yes** | `32+ character random string for signing JWT tokens` |
| `RAZORPAY_KEY_ID` | **Yes** | `rzp_live_...` or `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | **Yes** | Your Razorpay API Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | **Yes** | Webhook secret configured in Razorpay dashboard |
| `SUPABASE_URL` | **Yes** | `https://your-id.supabase.co` |
| `SUPABASE_ANON_KEY` | **Yes** | Supabase Project Anon Public Key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase Service Role Secret |
| `REDIS_URL` | Optional | `redis://default:pass@endpoint.upstash.io:6379` |
| `SMTP_HOST` | **Yes** | `smtp.gmail.com` |
| `SMTP_PORT` | **Yes** | `465` |
| `SMTP_SECURE` | **Yes** | `true` |
| `SMTP_USER` | **Yes** | `your-venue@gmail.com` |
| `SMTP_PASS` | **Yes** | Google App Password (16 characters from myaccount.google.com/apppasswords) |
| `SMTP_FROM_EMAIL` | **Yes** | `your-venue@gmail.com` |
| `SMTP_FROM_NAME` | **Yes** | `TurfFlow Arena` |
| `FAST2SMS_API_KEY` | Optional | Fast2SMS API Key (for SMS OTP dispatch in India) |

---

## 🔔 5. Razorpay Webhook Configuration

To ensure instant booking confirmation when customers pay:
1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Settings** ➔ **Webhooks** ➔ Click **Add New Webhook**.
3. **Webhook URL**:
   ```
   https://your-app.onrender.com/api/webhooks/razorpay
   ```
4. **Secret**: Enter the exact secret string you set in `RAZORPAY_WEBHOOK_SECRET`.
5. **Active Events**: Select:
   * `payment.captured`
   * `order.paid`
6. Click **Save**.

---

## 🩺 6. Verifying Your Live Deployment

Once Render finishes building and starts your service, test these endpoints:

1. **System Health Check**:
   ```bash
   curl https://your-app.onrender.com/api/health
   ```
   *Expected response*: `{"status":"healthy","databaseMode":"supabase-postgresql", ...}`

2. **WhatsApp Agent Status**:
   ```bash
   curl https://your-app.onrender.com/api/whatsapp/status
   ```
   *Expected response*: `{"status":"connected","linkedPhone":"919579158374", ...}`

3. **Live Web App**:
   Visit `https://your-app.onrender.com` in your browser. You will see the customer booking portal.

4. **Live WhatsApp AI Test**:
   Send `"Hi"` or `"Show football slots for tomorrow"` from any personal phone to your venue's WhatsApp number. The agent will reply instantly with available slots and interactive booking buttons.

---

## 🤖 7. UptimeRobot Setup (Keep Render Awake 24/7)

Render free instances spin down after 15 minutes of inactivity, which causes a 30-50 second cold start delay. Pinging the health API via UptimeRobot keeps the service active 24/7:

1. In your **UptimeRobot Dashboard**, select or edit your monitor (or click **Add New Monitor**).
2. Configure the following fields:
   * **Monitor Type**: `HTTP(s)`
   * **Friendly Name**: `turfflow.onrender.com` (or your preferred name)
   * **URL (or IP)**: `https://turfflow.onrender.com/api/health` *(use `/api/health` instead of `/`)*
   * **Monitoring Interval**: `5 minutes` (Free plan allows every 5 mins; prevents Render from idling after 15 mins)
   * **Monitor Timeout**: `30 seconds`
3. Click **Save changes**.
