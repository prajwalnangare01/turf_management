# 🛠️ Production Integration Guide — TurfFlow

This guide explains step-by-step how to transition this codebase from the simulated in-memory/browser-persistent engine to **real production backend services** (Razorpay Live, Managed PostgreSQL, ioredis Redis, and Interakt/MSG91 APIs).

---

## 1. Real Razorpay Integration

Currently, payment checkout is simulated in [`src/services/razorpayService.ts`](file:///c:/Turf%20Management/src/services/razorpayService.ts) and [`src/components/customer/CheckoutModal.tsx`](file:///c:/Turf%20Management/src/components/customer/CheckoutModal.tsx).

### A. Client-Side Razorpay SDK Setup
Add the Razorpay script tag to `index.html`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

In `CheckoutModal.tsx`, open the real Razorpay Checkout modal:
```typescript
const options = {
  key: process.env.RAZORPAY_KEY_ID, // 'rzp_live_xxx'
  amount: finalTotal * 100, // Amount in paise
  currency: "INR",
  name: "Apex Turf & Arena",
  description: `Booking ${court.name}`,
  order_id: order.order_id, // Generated from backend
  handler: function (response: any) {
    // Client-side confirmation (Fast UX)
    onSuccess(bookingRef);
  },
  prefill: {
    name: name,
    contact: phone,
    email: email
  },
  theme: {
    color: "#10b981"
  }
};
const rzp = new (window as any).Razorpay(options);
rzp.open();
```

### B. Backend Webhook Verification (Source of Truth)
Create a POST route `/api/webhooks/razorpay` in your backend server:
```typescript
import crypto from 'crypto';

app.post('/api/webhooks/razorpay', express.json(), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).send('Invalid webhook signature');
  }

  const event = req.body;
  if (event.event === 'payment.captured') {
    const paymentId = event.payload.payment.entity.id;
    const orderId = event.payload.payment.entity.order_id;
    
    // Call RazorpayService.processWebhook with event data
    await RazorpayService.processWebhook({
      event: 'payment.captured',
      payment_id: paymentId,
      order_id: orderId,
      method: event.payload.payment.entity.method,
      signature
    });
  }

  res.status(200).json({ status: 'ok' });
});
```

---

## 2. Managed PostgreSQL Setup

1. **Deploy Database**: Create a PostgreSQL database instance on Supabase, Render, Neon, or AWS RDS.
2. **Execute DDL Migration**: Run [`schema.sql`](file:///c:/Turf%20Management/schema.sql) in your database query editor.
3. **Connect ORM**: Install Prisma or Drizzle ORM in your backend:
   ```bash
   npm install @prisma/client
   npx prisma init
   ```
4. Update `store.ts` methods (`getBookings`, `createBooking`) to query PostgreSQL via Prisma/Drizzle instead of local memory.

---

## 3. Real Redis Slot Locking (`ioredis`)

Replace [`src/services/redisLockService.ts`](file:///c:/Turf%20Management/src/services/redisLockService.ts) in-memory array with `ioredis`:

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Acquire 5-min TTL lock (SET key val NX EX 300)
export async function acquireLock(courtId: string, date: string, startTime: string, sessionId: string) {
  const key = `lock:${courtId}:${date}:${startTime}`;
  const result = await redis.set(key, sessionId, 'NX', 'EX', 300);
  return result === 'OK'; // true if lock acquired, false if slot already taken
}

// Release lock
export async function releaseLock(courtId: string, date: string, startTime: string) {
  const key = `lock:${courtId}:${date}:${startTime}`;
  await redis.del(key);
}
```

---

## 4. WhatsApp & SMS API Integration

In [`src/services/notificationService.ts`](file:///c:/Turf%20Management/src/services/notificationService.ts), connect to Interakt or Meta Cloud API:

```typescript
import axios from 'axios';

export async function sendWhatsAppConfirmation(customerPhone: string, message: string) {
  try {
    await axios.post(
      'https-[#]api.interakt.ai/v1/public/message/',
      {
        countryCode: '+91',
        phoneNumber: customerPhone,
        type: 'Template',
        template: {
          name: 'booking_confirmation',
          languageCode: 'en',
          headerValues: [message]
        }
      },
      {
        headers: {
          Authorization: `Basic ${process.env.WHATSAPP_API_KEY}`
        }
      }
    );
  } catch (error) {
    console.warn('WhatsApp API failed. Triggering SMS fallback via MSG91...', error);
    // Trigger SMS fallback
  }
}
```

---

## 5. Summary Checklist Before Going Live

- [ ] Create Razorpay Live account and generate `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`.
- [ ] Configure Razorpay Webhook URL `https://your-domain.com/api/webhooks/razorpay` in Razorpay Dashboard.
- [ ] Run [`schema.sql`](file:///c:/Turf%20Management/schema.sql) on PostgreSQL database.
- [ ] Spin up Upstash / Redis instance for slot locks.
- [ ] Set up environment variables from [`.env.example`](file:///c:/Turf%20Management/.env.example).
- [ ] Build production assets using `npm run build`.
