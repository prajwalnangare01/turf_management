# 📱 WhatsApp Business Cloud API Integration Guide

This guide covers connecting TurfFlow to the official **Meta WhatsApp Cloud API** (Graph API v21.0) or alternative WhatsApp Gateways (Evolution API, Twilio, Gupshup, Interakt).

---

## 🏢 1. Official Meta WhatsApp Cloud API Setup

### Step 1: Create Meta Developer App
1. Go to [developers.facebook.com](https://developers.facebook.com/).
2. Create an App ➔ Select Type: **"Business"**.
3. Under Add Products, select **"WhatsApp"** and click **Set up**.
4. Meta will grant you:
   - A **Test WhatsApp Phone Number** (or you can connect your venue's real WhatsApp phone number).
   - A **Phone Number ID** (e.g. `104928374928374`).
   - A **WhatsApp Business Account ID (WABA)**.
   - A temporary 24-hour access token (generate a **Permanent System User Access Token** in Meta Business Settings under *System Users ➔ Add Assets ➔ WhatsApp Business Account*).

---

### Step 2: Configure Webhook in Meta App Dashboard
1. In the WhatsApp tab in Meta Developer Portal, go to **"Configuration"**.
2. Click **"Edit"** next to **Webhook**.
3. **Callback URL**:
   - If using n8n: `https://your-public-domain.com/webhook/turfflow-whatsapp`
   - If using TurfFlow Backend directly: `https://your-public-domain.com/api/webhooks/whatsapp`
4. **Verify Token**:
   - Enter `turfflow_secret_token_123` (or whatever you configured in `process.env.WHATSAPP_VERIFY_TOKEN`).
5. Click **"Verify and Save"**.
6. Under **Webhook Fields**, click **"Subscribe"** to `messages`.

---

## 💬 2. Message Types & Formats

### A. Dynamic Interactive List Messages (Slot & Sport Picker)
Instead of forcing customers to type long slot strings, you can present interactive buttons or a list menu:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "⚽ Select Sport" },
    "body": { "text": "Choose the sport you want to play at TurfFlow Arena:" },
    "action": {
      "button": "View Sports",
      "sections": [
        {
          "title": "Available Sports",
          "rows": [
            { "id": "sport_football", "title": "⚽ Football", "description": "FIFA 5-a-side synthetic turf" },
            { "id": "sport_cricket", "title": "🏏 Box Cricket", "description": "High-net multi-sport pitch" },
            { "id": "sport_badminton", "title": "🏸 Badminton", "description": "BWF wooden indoor court" }
          ]
        }
      ]
    }
  }
}
```

### B. Interactive Action Buttons (Pay Now / Directions / Reschedule)
After slot reservation, send interactive buttons:
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {
      "text": "🎟️ Slot Held for 5 Minutes!\nRef: TRF-20261105-8346\nAmount: ₹1,800\n\nPlease complete payment below:"
    },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "btn_pay_upi", "title": "💳 Pay via UPI" } },
        { "type": "reply", "reply": { "id": "btn_change_time", "title": "🔄 Change Time" } }
      ]
    }
  }
}
```

---

## ⚡ 3. Alternative WhatsApp Gateways

If you prefer self-hosted or third-party WhatsApp providers:

### Evolution API / Baileys (Zero Meta Verification Needed)
- Open-source, connects to standard WhatsApp Web via QR code.
- Forward incoming messages to the same n8n webhook URL:
  `http://localhost:5678/webhook/turfflow-whatsapp`
- Supports interactive buttons, media, and plain text.

### Twilio WhatsApp API
- Set incoming webhook URL in Twilio Console to:
  `http://localhost:5678/webhook/turfflow-whatsapp`
- TurfFlow's payload normalizer node automatically recognizes Twilio's `From` and `Body` fields!
