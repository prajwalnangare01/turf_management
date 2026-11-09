import { store } from './store';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { Booking, Customer, Payment, BlockedSlot, Court, SlotLock } from '../types/schema';
import { RealtimeChannel } from '@supabase/supabase-js';

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
      if (!cErr && courts && courts.length > 0) {
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
            saturday_price_per_hour: Number(c.saturday_price_per_hour) || 1600,
            sunday_price_per_hour: Number(c.sunday_price_per_hour) || 1600,
            weekend_price_per_hour: Number(c.weekend_price_per_hour) || 1600,
            peak_enabled: Boolean(c.peak_enabled),
            peak_start_time: typeof c.peak_start_time === 'string' ? c.peak_start_time.slice(0, 5) : '18:00',
            peak_end_time: typeof c.peak_end_time === 'string' ? c.peak_end_time.slice(0, 5) : '23:00',
            peak_price_per_hour: Number(c.peak_price_per_hour) || 1800,
            sport_ids: matchingSports.length > 0 ? matchingSports : ['sp-football']
          };
        });
        store.setCourts(enrichedCourts);
      }

      // 4. Fetch Customers
      const { data: customers, error: custErr } = await supabase.from('customers').select('*');
      if (!custErr && customers) {
        store.setCustomers(customers);
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
          created_at: b.created_at,
          updated_at: b.updated_at
        }));

        store.setBookings(normalizedBookings);
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
      const payload = {
        id: booking.id,
        booking_ref: booking.booking_ref,
        customer_id: booking.customer_id,
        court_id: booking.court_id,
        sport_id: booking.sport_id,
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
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
        created_at: booking.created_at || new Date().toISOString(),
        updated_at: booking.updated_at || new Date().toISOString()
      };

      const { error } = await supabase.from('bookings').upsert([payload], { onConflict: 'id' });
      if (error) {
        console.error('❌ [Supabase Sync] Error syncing booking:', error.message);
        return false;
      }
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
      const payload = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('bookings')
        .update(payload)
        .or(`id.eq.${bookingId},booking_ref.eq.${bookingId}`);

      if (error) {
        console.error('❌ [Supabase Sync] Error updating booking:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception updating booking:', err.message);
      return false;
    }
  }

  /**
   * Upsert customer in Supabase
   */
  public static async syncCustomerToSupabase(customer: Customer): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('customers')
        .upsert([customer], { onConflict: 'phone' });

      if (error) {
        console.error('❌ [Supabase Sync] Error syncing customer:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase Sync] Exception syncing customer:', err.message);
      return false;
    }
  }

  /**
   * Record payment in Supabase
   */
  public static async syncPaymentToSupabase(payment: Payment): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('payments').insert([payment]);
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
}
