# ⚡ n8n Setup & Workflow Import Guide — TurfFlow

This guide explains how to deploy, configure, and run the TurfFlow WhatsApp automation workflows inside **n8n**.

---

## 🚀 1. Running n8n Locally or in Production

### Option A: Run via Docker (Recommended)
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -e N8N_DEFAULT_BINARY_DATA_MODE=filesystem \
  -e WEBHOOK_URL=https://your-domain.ngrok-free.app/ \
  -v ~/.n8n:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

### Option B: Run via npm
```bash
npm install -g n8n
n8n start
```
Open your browser at `http://localhost:5678/`.

---

## 📥 2. Importing TurfFlow Workflows into n8n

In your n8n dashboard:
1. Click **"Workflows"** in the left sidebar.
2. Click the **"..."** (More options) button in the top right and select **"Import from File"** (or press `Ctrl+O`).
3. Import each of the 4 workflow files located in `whatsapp-automation/n8n-workflows/`:
   - `01_TurfFlow_WhatsApp_AI_Agent_Master.json` *(The Conversational Booking AI Agent)*
   - `02_Razorpay_Payment_Success_Notification.json` *(Instant WhatsApp Ticket Confirmation)*
   - `03_Match_Day_Reminder_Cron.json` *(Automated 2-Hour Match Reminder)*
   - `04_Post_Match_Review_Feedback.json` *(Automated Post-Match Player Feedback)*

---

## 🔑 3. Configuring Credentials & Environment Variables

### A. LLM Provider Credentials
In Workflow 1 (`01_TurfFlow_WhatsApp_AI_Agent_Master`), double click the **"OpenAI Chat Model"** node (or replace with **Google Gemini** or **Anthropic**):
- Select **Create New Credential**
- Enter your API Key (`sk-...` or Gemini API Key)
- Recommended models: `gpt-4o`, `gemini-1.5-flash`, or `claude-3-5-sonnet`.

### B. WhatsApp Meta Cloud API Credentials
Set the following environment variables in n8n or inside the HTTP Request nodes:
- `WHATSAPP_PHONE_NUMBER_ID`: Your Meta WhatsApp Business Phone Number ID (from Meta App Dashboard).
- `WHATSAPP_ACCESS_TOKEN`: Your Permanent System User Access Token.

### C. Backend API Endpoint
By default, the tools call:
`http://localhost:5000/api/...`
If n8n is running in Docker and the TurfFlow backend is running on your host machine, set the URL to:
`http://host.docker.internal:5000/api/...`

---

## 🧪 4. Testing the Workflows

### Testing Workflow 1 (AI Agent):
1. In n8n, open `01_TurfFlow_WhatsApp_AI_Agent_Master`.
2. Click **"Test Step"** on the **WhatsApp Inbound Webhook** node.
3. Send a test POST request to the Webhook Test URL:
```bash
curl -X POST http://localhost:5678/webhook-test/turfflow-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "fromPhone": "+919876543210",
    "senderName": "Rohan",
    "messageText": "Show football slots for tomorrow"
  }'
```
4. Observe the execution path:
   - Payload Normalizer runs
   - AI Agent activates
   - Tool `check_available_slots` executes against TurfFlow backend
   - Agent synthesizes formatted response with sports emojis
   - Response is returned and dispatched to WhatsApp!

### Testing Workflow 2 (Payment Capture):
1. Open `02_Razorpay_Payment_Success_Notification`.
2. Click **"Test Step"** on the Razorpay Webhook node.
3. Send simulated capture payload:
```bash
curl -X POST http://localhost:5678/webhook-test/turfflow-razorpay-success \
  -H "Content-Type: application/json" \
  -d '{
    "booking_ref": "TRF-20261105-1001",
    "customer_phone": "+919876543210",
    "payment_id": "pay_test_123"
  }'
```
4. Observe the booking transition to `confirmed` and the WhatsApp pass dispatch!
