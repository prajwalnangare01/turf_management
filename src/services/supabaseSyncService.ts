import { store } from './store';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { Booking, Customer, Payment, BlockedSlot, Court, SlotLock, Venue } from '../types/schema';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getBookingGatePassOtp, getBookingGroupRef } from '../utils/formatters';

export class SupabaseSyncService {
  private static realtimeChannel: RealtimeChannel | null = null;
  private static isHydrating = false;
  private static isInitialized = false;

  /**
   * Initialize Supabase Synchronization
   * Called on app startup
   */
  public static async init(): Promise<boolean> {
    if (this.isInitialized) return true;
    this.isInitialized = true;

    if (!isSupabaseConfigured()) {
      console.log('ℹ️  Supabase credentials not configured. Website running in local in-memory fallback mode.');
      return false;
    }

    // 1. Initial hydration from Supabase
    await this.hydrateFromSupabase();

    // 2. Subscribe to Realtime WebSocket channel
    this.subscribeToRealtime();

    // 3. Network & WebSocket reconnection listener (CC-DB2)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('📡 [Supabase Sync] Network online detected. Resyncing state...');
        this.hydrateFromSupabase();
      });

      // 4. Background polling resilience sync every 4 seconds
      setInterval(() => {
        this.hydrateFromSupabase();
      }, 4000);
    }

    return true;
  }

  /**
   * Hydrate in-memory store from live Supabase PostgreSQL database
   */
  public static async hydrateFromSupabase(): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase || this.isHydrating) return false;

    try {
      this.isHydrating = true;
      console.log('🔄 [Supabase Sync] Hydrating website store from Supabase...');

      // 1. Fetch Venue
      const { data: venues, error: vErr } = await supabase.from('venues').select('*').limit(1);
      if (!vErr && venues && venues.length > 0) {
        store.setVenue({
          ...store.getVenue(),
          ...venues[0]
        });
      }

      // 2. Fetch Sports
      const { data: sports, error: sErr } = await supabase.from('sports').select('*');
      if (!sErr && sports && sports.length > 0) {
        store.setSports(sports);
      }

      // 3. Fetch Courts & Court Sports
      const { data: courts, error: cErr } = await supabase.from('courts').select('*');
      const { data: courtSports, error: csErr } = await supabase.from('court_sports').select('*');
      if (!cErr && courts) {
        const enrichedCourts: Court[] = courts.map((c: any) => {
          const matchingSports = (courtSports || [])
            .filter((cs: any) => cs.court_id === c.id)
            .map((cs: any) => cs.sport_id);

          return {
            id: c.id,
            venue_id: c.venue_id,
            name: c.name,
            slot_duration_minutes: c.slot_duration_minutes || 60,
            opening_time: typeof c.opening_time === 'string' ? c.opening_time.slice(0, 5) : '06:00',
            closing_time: typeof c.closing_time === 'string' ? c.closing_time.slice(0, 5) : '23:00',
            buffer_minutes: c.buffer_minutes || 0,
            status: c.status || 'active',
            base_price_per_hour: Number(c.base_price_per_hour) || 1200,
            original_price_per_hour: c.original_price_per_hour ? Number(c.original_price_per_hour) : undefined,
            saturday_price_per_hour: Number(c.saturday_price_per_hour) || 1600,
            saturday_offer_price_per_hour: c.saturday_offer_price_per_hour ? Number(c.saturday_offer_price_per_hour) : undefined,
            sunday_price_per_hour: Number(c.sunday_price_per_hour) || 1600,
            sunday_offer_price_per_hour: c.sunday_offer_price_per_hour ? Number(c.sunday_offer_price_per_hour) : undefined,
            weekend_price_per_hour: Number(c.weekend_price_per_hour) || 1600,
            peak_enabled: Boolean(c.peak_enabled),
            peak_start_time: typeof c.peak_start_time === 'string' ? c.peak_start_time.slice(0, 5) : '18:00',
            peak_end_time: typeof c.peak_end_time === 'string' ? c.peak_end_time.slice(0, 5) : '23:00',
            peak_price_per_hour: Number(c.peak_price_per_hour) || 1800,
            peak_offer_price_per_hour: c.peak_offer_price_per_hour ? Number(c.peak_offer_price_per_hour) : undefined,
            offer_end_date: c.offer_end_date ? String(c.offer_end_date).slice(0, 10) : undefined,
            sport_ids: matchingSports.length > 0 ? matchingSports : ['sp-football']
          };
        });
        store.setCourts(enrichedCourts);
      }

      // 4. Fetch Customers
      const { data: customers, error: custErr } = await supabase.from('customers').select('*');
      if (!custErr && customers) {
        // Merge with existing local store to avoid wiping in-flight registrations
        const existingLocal = store.getCustomers();
        const mergedCustomers = [...customers];
        for (const loc of existingLocal) {
          const found = mergedCustomers.some(c => c.id === loc.id || c.phone === loc.phone);
          if (!found) {
            mergedCustomers.push(loc);
          }
        }
        store.setCustomers(mergedCustomers);
      }

      // 5. Fetch Bookings
      const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!bErr && bookings) {
        const normalizedBookings: Booking[] = bookings.map((b: any) => ({
          id: b.id,
          booking_ref: b.booking_ref,
          customer_id: b.customer_id,
          court_id: b.court_id,
          sport_id: b.sport_id,
          booking_date: typeof b.booking_date === 'string' ? b.booking_date.slice(0, 10) : b.booking_date,
          start_time: typeof b.start_time === 'string' ? b.start_time.slice(0, 5) : b.start_time,
          end_time: typeof b.end_time === 'string' ? b.end_time.slice(0, 5) : b.end_time,
          source: b.source,
          status: b.status,
          total_amount: Number(b.total_amount),
          discount_amount: Number(b.discount_amount || 0),
          coupon_id: b.coupon_id || undefined,
          created_by_admin_id: b.created_by_admin_id || undefined,
          notes: b.notes || undefined,
          refund_amount: b.refund_amount ? Number(b.refund_amount) : undefined,
          refund_reason: b.refund_reason || undefined,
          refunded_at: b.refunded_at || undefined,
          cancelled_by: b.cancelled_by || undefined,
          cancelled_at: b.cancelled_at || undefined,
          cancellation_notice_hours: b.cancellation_notice_hours ? Number(b.cancellation_notice_hours) : undefined,
          cancellation_met_terms: b.cancellation_met_terms ?? undefined,
          gate_pass_otp: b.gate_pass_otp || getBookingGatePassOtp(b),
          group_ref: b.group_ref || getBookingGroupRef(b),
          gateway_payment_id: b.gateway_payment_id || undefined,
          total_order_amount: b.total_order_amount ? Number(b.total_order_amount) : undefined,
          all_slots: Array.isArray(b.all_slots) ? b.all_slots : undefined,
          formatted_slots: b.formatted_slots || undefined,
          created_at: b.created_at,
          updated_at: b.updated_at
        }));

        // Merge with existing local store to avoid wiping in-flight bookings
        const existingLocal = store.getBookings();
        const mergedBookings = [...normalizedBookings];
        const nowMs = Date.now();

        for (const loc of existingLocal) {
          const exists = mergedBookings.some(b => b.id === loc.id || b.booking_ref === loc.booking_ref);
          if (!exists) {
            const createdAtMs = loc.created_at ? new Date(loc.created_at).getTime() : 0;
            // Retain only brand-new in-flight uncommitted holds created in the last 60 seconds
            if (nowMs - createdAtMs < 60000 && loc.status === 'pending_payment') {
              mergedBookings.push(loc);
              // Trigger background sync to Supabase so it gets persisted
              this.syncBookingToSupabase(loc).catch(err => {
                console.warn('[Supabase Sync] Re-syncing in-flight booking during hydration:', err);
              });
            }
          }
        }

        store.setBookings(mergedBookings);
      }

      // 6. Fetch Blocked Slots
      const { data: blocked, error: blkErr } = await supabase.from('blocked_slots').select('*');
      if (!blkErr && blocked) {
        store.setBlockedSlots(blocked.map((bl: any) => ({
          id: bl.id,
          court_id: bl.court_id,
          date: typeof bl.date === 'string' ? bl.date.slice(0, 10) : bl.date,
          start_time: typeof bl.start_time === 'string' ? bl.start_time.slice(0, 5) : bl.start_time,
          end_date: bl.end_date ? (typeof bl.end_date === 'string' ? bl.end_date.slice(0, 10) : bl.end_date) : undefined,
          end_time: typeof bl.end_time === 'string' ? bl.end_time.slice(0, 5) : bl.end_time,
          reason: bl.reason,
          created_by_admin_id: bl.created_by_admin_id
        })));
      }

      // 7. Fetch Active Slot Locks (5-min holds from WhatsApp or Site)
      const { data: locks, error: lockErr } = await supabase.from('slot_locks').select('*');
      if (!lockErr && locks) {
        const nowMs = Date.now();
        const activeLocks = locks
          .filter((l: any) => Number(l.expires_at) > nowMs)
          .map((l: any) => ({
            court_id: l.court_id,
            date: typeof l.date === 'string' ? l.date.slice(0, 10) : l.date,
            start_time: typeof l.start_time === 'string' ? l.start_time.slice(0, 5) : l.start_time,
            locked_by: l.locked_by,
            expires_at: Number(l.expires_at)
          }));
        store.setSlotLocks(activeLocks);
      }

      // 8. Fetch Payments
      const { data: payments, error: pErr } = await supabase.from('payments').select('*');
      if (!pErr && payments) {
        store.setPayments(payments.map((p: any) => ({
          id: p.id,
          booking_id: p.booking_id,
          gateway: p.gateway,
          gateway_order_id: p.gateway_order_id || undefined,
          gateway_payment_id: p.gateway_payment_id || undefined,
          amount: Number(p.amount),
          status: p.status,
          method: p.method,
          raw_webhook_payload: p.raw_webhook_payload || undefined,
          created_at: p.created_at,
          updated_at: p.updated_at
        })));
      }

      console.log(`✅ [Supabase Sync] Hydration complete! Loaded ${bookings?.length || 0} bookings, ${customers?.length || 0} customers.`);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase Sync] Hydration warning:', err.message);
      return false;
    } finally {
      this.isHydrating = false;
    }
  }

  /**
   * Subscribe to Realtime WebSocket channel for instant multi-channel synchronization
   * When WhatsApp bot books a slot, this triggers instantly on the website!
   */
  public static subscribeToRealtime() {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }

    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch (e) {}
      this.realtimeChannel = null;
    }

    try {
      console.log('📡 [Supabase Realtime] Connecting to multi-agent sync channel...');

      this.realtimeChannel = supabase
        .channel(`turfflow-website-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          (payload: any) => {
            console.log(`⚡ [Realtime Sync Event] Booking ${payload.eventType}:`, payload.new?.booking_ref || payload.old?.id);
            this.handleRealtimeBookingChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          (payload: any) => {
            console.log(`⚡ [Realtime Sync Event] Customer ${payload.eventType}:`, payload.new?.phone || payload.old?.id);
            this.handleRealtimeCustomerChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blocked_slots' },
          (payload: any) => {
            this.handleRealtimeBlockedSlotChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'slot_locks' },
          (payload: any) => {
            this.handleRealtimeSlotLockChange(payload);
          }
        )
        .subscribe((status) => {
          console.log(`📡 [Supabase Realtime] Status: ${status}`);
          if (status === 'SUBSCRIBED') {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('turfflow_supabase_status', { detail: { connected: true } }));
            }
          }
        });
    } catch (err: any) {
      console.warn('⚠️ [Supabase Realtime] Subscription error:', err.message);
    }
  }

  private static handleRealtimeBookingChange(payload: any) {
    const bookings = [...store.getBookings()];
    const raw = payload.new;

    if (payload.eventType === 'INSERT' && raw) {
      const normalized: Booking = {
        id: raw.id,
        booking_ref: raw.booking_ref,
        customer_id: raw.customer_id,
        court_id: raw.court_id,
        sport_id: raw.sport_id,
        booking_date: typeof raw.booking_date === 'string' ? raw.booking_date.slice(0, 10) : raw.booking_date,
        start_time: typeof raw.start_time === 'string' ? raw.start_time.slice(0, 5) : raw.start_time,
        end_time: typeof raw.end_time === 'string' ? raw.end_time.slice(0, 5) : raw.end_time,
        source: raw.source,
        status: raw.status,
        total_amount: Number(raw.total_amount),
        discount_amount: Number(raw.discount_amount || 0),
        coupon_id: raw.coupon_id || undefined,
        created_by_admin_id: raw.created_by_admin_id || undefined,
        notes: raw.notes || undefined,
        refund_amount: raw.refund_amount ? Number(raw.refund_amount) : undefined,
        refund_reason: raw.refund_reason || undefined,
        refunded_at: raw.refunded_at || undefined,
        cancelled_by: raw.cancelled_by || undefined,
        cancelled_at: raw.cancelled_at || undefined,
        gate_pass_otp: raw.gate_pass_otp || getBookingGatePassOtp(raw),
        group_ref: raw.group_ref || getBookingGroupRef(raw),
        gateway_payment_id: raw.gateway_payment_id || undefined,
        total_order_amount: raw.total_order_amount ? Number(raw.total_order_amount) : undefined,
        all_slots: Array.isArray(raw.all_slots) ? raw.all_slots : undefined,
        formatted_slots: raw.formatted_slots || undefined,
        created_at: raw.created_at,
        updated_at: raw.updated_at
      };

      const existingIndex = bookings.findIndex(b => b.id === normalized.id || b.booking_ref === normalized.booking_ref);
      if (existingIndex === -1) {
        bookings.unshift(normalized);
      } else {
        bookings[existingIndex] = normalized;
      }
      store.setBookings(bookings);
    } else if (payload.eventType === 'UPDATE' && raw) {
      const index = bookings.findIndex(b => b.id === raw.id || b.booking_ref === raw.booking_ref);
      if (index !== -1) {
        bookings[index] = {
          ...bookings[index],
          ...raw,
          booking_date: typeof raw.booking_date === 'string' ? raw.booking_date.slice(0, 10) : raw.booking_date,
          start_time: typeof raw.start_time === 'string' ? raw.start_time.slice(0, 5) : raw.start_time,
          end_time: typeof raw.end_time === 'string' ? raw.end_time.slice(0, 5) : raw.end_time,
          total_amount: Number(raw.total_amount),
          discount_amount: Number(raw.discount_amount || 0)
        };
        store.setBookings(bookings);
      }
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const filtered = bookings.filter(b => b.id !== payload.old.id);
      store.setBookings(filtered);
    }
  }

  private static handleRealtimeCustomerChange(payload: any) {
    const customers = [...store.getCustomers()];
    const raw = payload.new;

    if (payload.eventType === 'INSERT' && raw) {
      const existing = customers.findIndex(c => c.id === raw.id || c.phone === raw.phone);
      if (existing === -1) {
        customers.push(raw);
      } else {
        customers[existing] = { ...customers[existing], ...raw };
      }
      store.setCustomers(customers);
    } else if (payload.eventType === 'UPDATE' && raw) {
      const index = customers.findIndex(c => c.id === raw.id || c.phone === raw.phone);
      if (index !== -1) {
        customers[index] = { ...customers[index], ...raw };
        store.setCustomers(customers);
      }
    }
  }

  private static handleRealtimeBlockedSlotChange(payload: any) {
    const blocked = [...store.getBlockedSlots()];
    if (payload.eventType === 'INSERT' && payload.new) {
      if (!blocked.some(b => b.id === payload.new.id)) {
        blocked.push(payload.new);
        store.setBlockedSlots(blocked);
      }
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const filtered = blocked.filter(b => b.id !== payload.old.id);
      store.setBlockedSlots(filtered);
    }
  }

  private static handleRealtimeSlotLockChange(payload: any) {
    const locks = [...store.getSlotLocks()];
    if (payload.eventType === 'INSERT' && payload.new) {
      const newLock: SlotLock = {
        court_id: payload.new.court_id,
        date: typeof payload.new.date === 'string' ? payload.new.date.slice(0, 10) : payload.new.date,
        start_time: typeof payload.new.start_time === 'string' ? payload.new.start_time.slice(0, 5) : payload.new.start_time,
        locked_by: payload.new.locked_by,
        expires_at: Number(payload.new.expires_at)
      };
      const existing = locks.findIndex(l => l.court_id === newLock.court_id && l.date === newLock.date && l.start_time === newLock.start_time);
      if (existing === -1) {
        locks.push(newLock);
      } else {
        locks[existing] = newLock;
      }
      store.setSlotLocks(locks);
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const filtered = locks.filter(l => l.court_id !== payload.old.court_id || l.date !== payload.old.date || l.start_time !== payload.old.start_time);
      store.setSlotLocks(filtered);
    }
  }

  // ===========================================================================
  // OUTBOUND MUTATION SYNC METHODS (From Website to Supabase)
  // ===========================================================================

  /**
   * Persist a new booking to Supabase
   */
  public static async syncBookingToSupabase(booking: Booking): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      // 1. Ensure the customer exists in Supabase first to satisfy foreign key constraint
      if (booking.customer_id) {
        const customer = store.getCustomers().find(c => c.id === booking.customer_id);
        if (customer) {
          const syncedCust = await this.syncCustomerToSupabase(customer);
          if (syncedCust && syncedCust.id !== booking.customer_id) {
            booking.customer_id = syncedCust.id;
          }
        }
      }

      const formattedStart = typeof booking.start_time === 'string' && booking.start_time.length === 5 
        ? `${booking.start_time}:00` 
        : booking.start_time;
      const formattedEnd = typeof booking.end_time === 'string' && booking.end_time.length === 5 
        ? `${booking.end_time}:00` 
        : booking.end_time;

      const payload = {
        id: booking.id,
        booking_ref: booking.booking_ref,
        customer_id: booking.customer_id,
        court_id: booking.court_id,
        sport_id: booking.sport_id,
        booking_date: typeof booking.booking_date === 'string' ? booking.booking_date.slice(0, 10) : booking.booking_date,
        start_time: formattedStart,
        end_time: formattedEnd,
        source: booking.source || 'online',
        status: booking.status || 'pending_payment',
        total_amount: booking.total_amount,
        discount_amount: booking.discount_amount || 0,
        coupon_id: booking.coupon_id || null,
        created_by_admin_id: booking.created_by_admin_id || null,
        notes: booking.notes || null,
        refund_amount: booking.refund_amount || 0,
        refund_reason: booking.refund_reason || null,
        refunded_at: booking.refunded_at || null,
        cancelled_by: booking.cancelled_by || null,
        cancelled_at: booking.cancelled_at || null,
        cancellation_notice_hours: booking.cancellation_notice_hours || null,
        cancellation_met_terms: booking.cancellation_met_terms ?? null,
        gateway_payment_id: booking.gateway_payment_id || null,
        created_at: booking.created_at || new Date().toISOString(),
        updated_at: booking.updated_at || new Date().toISOString()
      };

      const { error } = await supabase.from('bookings').upsert([payload], { onConflict: 'id' });
      if (error) {
        console.error('❌ [Supabase Sync] Error syncing booking:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Synced booking ${booking.booking_ref} (${booking.status}) to Supabase.`);
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing booking:', err.message);
      return false;
    }
  }

  /**
   * Update an existing booking in Supabase
   */
  public static async updateBookingInSupabase(bookingId: string, updates: Partial<Booking>): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      // Whitelist only columns that exist in the PostgreSQL bookings table
      const allowedColumns = [
        'booking_ref', 'customer_id', 'court_id', 'sport_id',
        'booking_date', 'start_time', 'end_time', 'source', 'status',
        'total_amount', 'discount_amount', 'coupon_id', 'created_by_admin_id',
        'notes', 'refund_amount', 'refund_reason', 'refunded_at',
        'cancelled_by', 'cancelled_at', 'cancellation_notice_hours',
        'cancellation_met_terms', 'gateway_payment_id', 'reminder_sent'
      ];

      const payload: Record<string, any> = {
        updated_at: new Date().toISOString()
      };

      for (const [key, value] of Object.entries(updates)) {
        if (allowedColumns.includes(key)) {
          if (key === 'start_time' || key === 'end_time') {
            payload[key] = typeof value === 'string' && value.length === 5 ? `${value}:00` : value;
          } else {
            payload[key] = value ?? null;
          }
        }
      }

      const { error } = await supabase
        .from('bookings')
        .update(payload)
        .or(`id.eq.${bookingId},booking_ref.eq.${bookingId}`);

      if (error) {
        console.error('❌ [Supabase Sync] Error updating booking:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Updated booking ${bookingId} in Supabase.`);
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception updating booking:', err.message);
      return false;
    }
  }

  /**
   * Upsert customer in Supabase
   */
  public static async syncCustomerToSupabase(customer: Customer): Promise<Customer> {
    const supabase = getSupabase();
    if (!supabase) return customer;

    try {
      // Check if customer exists by phone to align ID
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', customer.phone)
        .limit(1);

      if (existing && existing.length > 0 && existing[0].id !== customer.id) {
        customer.id = existing[0].id;
      }

      const payload = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email || null,
        password: customer.password || null,
        total_bookings: customer.total_bookings || 0,
        total_spent: customer.total_spent || 0,
        no_show_count: customer.no_show_count || 0,
        is_blacklisted: customer.is_blacklisted || false,
        email_verified: customer.email_verified || false,
        created_at: customer.created_at || new Date().toISOString()
      };

      const { error } = await supabase
        .from('customers')
        .upsert([payload], { onConflict: 'id' });

      if (error) {
        console.error('❌ [Supabase Sync] Error syncing customer:', error.message);
      }
      return customer;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing customer:', err.message);
      return customer;
    }
  }

  /**
   * Record payment in Supabase
   */
  public static async syncPaymentToSupabase(payment: Payment): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const payload = {
        id: payment.id,
        booking_id: payment.booking_id,
        gateway: payment.gateway || 'razorpay',
        gateway_order_id: payment.gateway_order_id || null,
        gateway_payment_id: payment.gateway_payment_id || null,
        amount: payment.amount,
        status: payment.status,
        method: payment.method || 'upi',
        raw_webhook_payload: payment.raw_webhook_payload || null,
        created_at: payment.created_at || new Date().toISOString(),
        updated_at: payment.updated_at || new Date().toISOString()
      };

      const { error } = await supabase.from('payments').upsert([payload], { onConflict: 'id' });
      if (error) {
        console.error('❌ [Supabase Sync] Error syncing payment:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing payment:', err.message);
      return false;
    }
  }

  /**
   * Add blocked slot in Supabase
   */
  public static async syncBlockedSlotToSupabase(slot: BlockedSlot): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('blocked_slots').insert([slot]);
      if (error) {
        console.error('❌ [Supabase Sync] Error syncing blocked slot:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing blocked slot:', err.message);
      return false;
    }
  }

  /**
   * Remove blocked slot in Supabase
   */
  public static async removeBlockedSlotFromSupabase(slotId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('blocked_slots').delete().eq('id', slotId);
      if (error) {
        console.error('❌ [Supabase Sync] Error deleting blocked slot:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception deleting blocked slot:', err.message);
      return false;
    }
  }

  /**
   * Persist a slot lock to Supabase (5-minute hold)
   * This immediately triggers Supabase Realtime so Admin Panel and WhatsApp Bot see the hold!
   */
  public static async syncSlotLockToSupabase(lock: SlotLock): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const payload = {
        court_id: lock.court_id,
        date: lock.date,
        start_time: lock.start_time,
        locked_by: lock.locked_by,
        expires_at: lock.expires_at
      };

      const { error } = await supabase
        .from('slot_locks')
        .upsert([payload], { onConflict: 'court_id,date,start_time' });

      if (error) {
        console.warn('⚠️ [Supabase Sync] Error syncing slot lock:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase Sync] Exception syncing slot lock:', err.message);
      return false;
    }
  }

  /**
   * Remove a slot lock from Supabase when released
   */
  public static async deleteSlotLockFromSupabase(courtId: string, date: string, startTime: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('slot_locks')
        .delete()
        .eq('court_id', courtId)
        .eq('date', date)
        .eq('start_time', startTime);

      if (error) {
        console.warn('⚠️ [Supabase Sync] Error deleting slot lock:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase Sync] Exception deleting slot lock:', err.message);
      return false;
    }
  }

  /**
   * Persist or update pitch (court) configuration in Supabase
   */
  public static async syncCourtToSupabase(court: Court): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const payload = {
        id: court.id,
        venue_id: court.venue_id || store.getVenue().id,
        name: court.name,
        slot_duration_minutes: court.slot_duration_minutes || 60,
        opening_time: court.opening_time.length === 5 ? `${court.opening_time}:00` : court.opening_time,
        closing_time: court.closing_time.length === 5 ? `${court.closing_time}:00` : court.closing_time,
        buffer_minutes: court.buffer_minutes || 0,
        status: court.status || 'active',
        base_price_per_hour: court.base_price_per_hour,
        original_price_per_hour: court.original_price_per_hour || null,
        saturday_price_per_hour: court.saturday_price_per_hour || court.base_price_per_hour,
        saturday_offer_price_per_hour: court.saturday_offer_price_per_hour || null,
        sunday_price_per_hour: court.sunday_price_per_hour || court.base_price_per_hour,
        sunday_offer_price_per_hour: court.sunday_offer_price_per_hour || null,
        weekend_price_per_hour: court.weekend_price_per_hour || court.base_price_per_hour,
        peak_enabled: Boolean(court.peak_enabled),
        peak_start_time: court.peak_start_time ? (court.peak_start_time.length === 5 ? `${court.peak_start_time}:00` : court.peak_start_time) : '18:00:00',
        peak_end_time: court.peak_end_time ? (court.peak_end_time.length === 5 ? `${court.peak_end_time}:00` : court.peak_end_time) : '23:00:00',
        peak_price_per_hour: court.peak_price_per_hour || 1800,
        peak_offer_price_per_hour: court.peak_offer_price_per_hour || null,
        offer_end_date: court.offer_end_date ? court.offer_end_date.slice(0, 10) : null
      };

      const { error } = await supabase.from('courts').upsert([payload], { onConflict: 'id' });
      if (error) {
        console.error('❌ [Supabase Sync] Error syncing court to Supabase:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Court ${court.name} synced to Supabase (Base: ₹${court.base_price_per_hour}, Original: ₹${court.original_price_per_hour || 'N/A'}).`);
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing court to Supabase:', err.message);
      return false;
    }
  }

  /**
   * Delete court and its related records (junction, pricing rules, blocked slots, locks) from Supabase
   */
  public static async deleteCourtFromSupabase(courtId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      // 1. Delete associated junction entries first
      await supabase.from('court_sports').delete().eq('court_id', courtId);
      // 2. Delete associated pricing rules if any
      await supabase.from('court_pricing_rules').delete().eq('court_id', courtId);
      // 3. Delete associated blocked slots if any
      await supabase.from('blocked_slots').delete().eq('court_id', courtId);
      // 4. Delete associated slot locks if any
      await supabase.from('slot_locks').delete().eq('court_id', courtId);
      // 5. Delete the court itself
      const { error } = await supabase.from('courts').delete().eq('id', courtId);
      if (error) {
        // If foreign key constraint blocks hard delete (e.g. historical bookings exist), mark inactive
        if (error.code === '23503') {
          console.warn('⚠️ [Supabase Sync] Court has associated bookings; marking inactive instead of hard deleting');
          await supabase.from('courts').update({ status: 'inactive' }).eq('id', courtId);
          return true;
        }
        console.error('❌ [Supabase Sync] Error deleting court from Supabase:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Court ${courtId} deleted from Supabase.`);
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception deleting court from Supabase:', err.message);
      return false;
    }
  }

  /**
   * Delete Sport from Supabase
   */
  public static async deleteSportFromSupabase(sportId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      await supabase.from('court_sports').delete().eq('sport_id', sportId);
      const { error } = await supabase.from('sports').delete().eq('id', sportId);
      if (error) {
        console.warn('⚠️ [Supabase Sync] Error deleting sport from Supabase:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Sport "${sportId}" deleted from Supabase.`);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase Sync] Exception deleting sport from Supabase:', err.message);
      return false;
    }
  }

  public static async syncVenueToSupabase(venue: Venue): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const payload: any = {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        timezone: venue.timezone || 'Asia/Kolkata',
        gst_number: venue.gst_number,
        contact_phone: venue.contact_phone,
        contact_email: venue.contact_email || null,
        is_active: venue.is_active,
        min_notice_minutes: venue.min_notice_minutes || 15,
        max_advance_days: venue.max_advance_days || 14,
        whatsapp_enabled: Boolean(venue.whatsapp_enabled),
        sms_fallback_enabled: Boolean(venue.sms_fallback_enabled),
        email_enabled: Boolean(venue.email_enabled),
        email_sender: venue.email_sender || null
      };

      const { error } = await supabase.from('venues').upsert([payload], { onConflict: 'id' });
      if (error) {
        console.warn('⚠️ [Supabase Sync] Note when syncing venue to Supabase:', error.message);
        return false;
      }
      console.log(`✅ [Supabase Sync] Venue ${venue.name} synced to Supabase.`);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase Sync] Exception syncing venue to Supabase:', err.message);
      return false;
    }
  }
}
