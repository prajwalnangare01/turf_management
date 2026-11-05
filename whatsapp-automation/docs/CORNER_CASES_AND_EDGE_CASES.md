# 🎯 TurfFlow — Master Corner Cases, Edge Cases & Use Cases Audit
> Refer to the master file at the project root: [CORNER_CASES_AND_EDGE_CASES.md](../../CORNER_CASES_AND_EDGE_CASES.md)

See full details covering:
1. **Site (Customer Web Portal)**: Buffer suppression on consecutive multi-hour slots, client device timezone drift, mobile UPI redirect reload, phone normalization, coupon concurrency.
2. **WhatsApp Automation (n8n)**: Stale availability protection, 2-step cancellation confirmations, colloquial Indian time handling, rapid-fire message debouncing, abandoned checkout hold recovery nudges.
3. **Admin Operations Dashboard**: Counter sales lock collision override, emergency weather / rainout mass cancellations, maintenance collision prevention, multi-tender split payments, RBAC security.
4. **Payments & Supabase Realtime Sync**: Razorpay webhook idempotency, post-lock-expiry late payment automated refund safeguard, midnight operating hours crossover, Supabase WebSocket reconnection resync.
