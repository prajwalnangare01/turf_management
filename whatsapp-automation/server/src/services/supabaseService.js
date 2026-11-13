// Supabase Synchronization & Realtime Service for TurfFlow
import { getSupabase, isSupabaseConfigured } from '../data/supabaseClient.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';

export class SupabaseService {
  static realtimeChannel = null;

  /**
   * Hydrate in-memory store from live Supabase PostgreSQL database
   */
  static async hydrateStore(store) {
    if (!isSupabaseConfigured()) {
      console.log('ℹ️  Supabase not configured. Operating with local store data.');
      return false;
    }

    try {
      const supabase = getSupabase();
      if (!supabase) return false;

      console.log('🔄 Hydrating TurfFlow server store from Supabase...');

      // 1. Fetch Venue
      const { data: venues, error: vErr } = await supabase.from('venues').select('*').limit(1);
      if (!vErr && venues?.length > 0) {
        store.venue = {
          ...store.venue,
          ...venues[0]
        };
      }

      // 2. Fetch Sports
      const { data: sports, error: sErr } = await supabase.from('sports').select('*');
      if (!sErr && sports?.length > 0) {
        store.sports = sports;
      }

      // 3. Fetch Courts & Court Sports
      const { data: courts, error: cErr } = await supabase.from('courts').select('*');
      const { data: courtSports, error: csErr } = await supabase.from('court_sports').select('*');
      if (!cErr && courts?.length > 0) {
        store.courts = courts
          .filter(c => c.status !== 'inactive')
          .sort((a, b) => {
            if (a.id === 'crt-001') return -1;
            if (b.id === 'crt-001') return 1;
            if (a.id === 'crt-002') return -1;
            if (b.id === 'crt-002') return 1;
            if (a.id === 'crt-003') return -1;
            if (b.id === 'crt-003') return 1;
            return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id));
          })
          .map(c => {
          const matchingSports = (courtSports || [])
            .filter(cs => cs.court_id === c.id)
            .map(cs => cs.sport_id);
          return {
            ...c,
            slot_duration_minutes: c.slot_duration_minutes || 60,
            opening_time: typeof c.opening_time === 'string' ? c.opening_time.slice(0, 5) : '06:00',
            closing_time: typeof c.closing_time === 'string' ? c.closing_time.slice(0, 5) : '23:00',
            original_price_per_hour: c.original_price_per_hour ? Number(c.original_price_per_hour) : undefined,
            base_price_per_hour: Number(c.base_price_per_hour) || 1200,
            saturday_price_per_hour: Number(c.saturday_price_per_hour) || 1600,
            saturday_offer_price_per_hour: c.saturday_offer_price_per_hour ? Number(c.saturday_offer_price_per_hour) : undefined,
            sunday_price_per_hour: Number(c.sunday_price_per_hour) || 1600,
            sunday_offer_price_per_hour: c.sunday_offer_price_per_hour ? Number(c.sunday_offer_price_per_hour) : undefined,
            peak_enabled: Boolean(c.peak_enabled),
            peak_start_time: typeof c.peak_start_time === 'string' ? c.peak_start_time.slice(0, 5) : '18:00',
            peak_end_time: typeof c.peak_end_time === 'string' ? c.peak_end_time.slice(0, 5) : '23:00',
            peak_price_per_hour: Number(c.peak_price_per_hour) || 1800,
            peak_offer_price_per_hour: c.peak_offer_price_per_hour ? Number(c.peak_offer_price_per_hour) : undefined,
            offer_end_date: c.offer_end_date ? String(c.offer_end_date).slice(0, 10) : undefined,
            sport_ids: matchingSports.length > 0 ? matchingSports : ['sp-football']
          };
        });
      }

      // 4. Fetch Cancellation Policies
      const { data: policies, error: cpErr } = await supabase.from('cancellation_policies').select('*');
      if (!cpErr && policies?.length > 0) {
        store.cancellationPolicies = policies.map(p => ({
          id: p.id,
          hours_before_start: p.hours_before_start,
          refund_percentage: p.refund_percentage,
          label: p.hours_before_start > 0 
            ? `${p.hours_before_start}h+ before: ${p.refund_percentage}% refund`
            : `Under ${policies[0]?.hours_before_start || 6}h: ${p.refund_percentage}% refund`
        }));
      }

      // 5. Fetch Customers
      const { data: customers, error: custErr } = await supabase.from('customers').select('*');
      if (!custErr && customers) {
        store.customers = customers;
      }

      // 6. Fetch Bookings
      const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      if (!bErr && bookings) {
        store.bookings = bookings.map(b => {
          const court = store.courts.find(c => c.id === b.court_id);
          const customer = store.customers.find(c => c.id === b.customer_id);
          return {
            ...b,
            gate_pass_otp: b.gate_pass_otp || WhatsAppFormatter.getBookingGatePassOtp(b),
            customer_name: b.customer_name || customer?.name || 'Customer',
            customer_phone: b.customer_phone || customer?.phone || '',
            court_name: b.court_name || court?.name || (b.court_id === 'crt-001' ? 'Turf A - FIFA 5-a-side' : b.court_id),
            booking_date: typeof b.booking_date === 'string' ? b.booking_date.slice(0, 10) : b.booking_date,
            start_time: typeof b.start_time === 'string' ? b.start_time.slice(0, 5) : b.start_time,
            end_time: typeof b.end_time === 'string' ? b.end_time.slice(0, 5) : b.end_time,
            total_amount: Number(b.total_amount),
            discount_amount: Number(b.discount_amount || 0)
          };
        });
      }

      // 7. Fetch Blocked Slots
      const { data: blocked, error: blkErr } = await supabase.from('blocked_slots').select('*');
      if (!blkErr && blocked) {
        store.blockedSlots = blocked.map(bl => ({
          id: bl.id,
          court_id: bl.court_id,
          date: typeof bl.date === 'string' ? bl.date.slice(0, 10) : bl.date,
          start_time: typeof bl.start_time === 'string' ? bl.start_time.slice(0, 5) : bl.start_time,
          end_date: bl.end_date ? (typeof bl.end_date === 'string' ? bl.end_date.slice(0, 10) : bl.end_date) : undefined,
          end_time: typeof bl.end_time === 'string' ? bl.end_time.slice(0, 5) : bl.end_time,
          reason: bl.reason,
          created_by_admin_id: bl.created_by_admin_id
        }));
      }

      console.log(`✅ Supabase hydration complete! Loaded ${store.courts.length} courts, ${store.customers.length} customers, ${store.bookings.length} bookings, ${store.blockedSlots?.length || 0} blocked slots.`);
      return true;
    } catch (err) {
      console.warn('⚠️ Supabase hydration warning:', err.message);
      return false;
    }
  }

  /**
   * Listen for real-time changes to bookings, customers, and payments via WebSocket
   */
  static subscribeToRealtime(store) {
    if (!isSupabaseConfigured() || this.realtimeChannel) {
      return;
    }

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      console.log('📡 Subscribing to Supabase Realtime channel for instant multi-channel sync...');

      this.realtimeChannel = supabase
        .channel('turfflow-agent-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          (payload) => {
            console.log(`⚡ [Realtime DB Change] Bookings ${payload.eventType}:`, payload.new?.booking_ref || payload.old?.id);
            if (payload.eventType === 'INSERT') {
              const cust = store.customers.find(c => c.id === payload.new.customer_id);
              const crt = store.courts.find(c => c.id === payload.new.court_id);
              const normalized = {
                ...payload.new,
                customer_name: payload.new.customer_name || cust?.name || 'Customer',
                customer_phone: payload.new.customer_phone || cust?.phone || '',
                court_name: payload.new.court_name || crt?.name || 'Turf Court',
                booking_date: typeof payload.new.booking_date === 'string' ? payload.new.booking_date.slice(0, 10) : payload.new.booking_date,
                start_time: typeof payload.new.start_time === 'string' ? payload.new.start_time.slice(0, 5) : payload.new.start_time,
                end_time: typeof payload.new.end_time === 'string' ? payload.new.end_time.slice(0, 5) : payload.new.end_time,
                total_amount: Number(payload.new.total_amount),
                discount_amount: Number(payload.new.discount_amount || 0)
              };
              const existingIdx = store.bookings.findIndex(b => b.id === normalized.id || b.booking_ref === normalized.booking_ref);
              if (existingIdx === -1) {
                store.bookings.unshift(normalized);
              } else {
                store.bookings[existingIdx] = normalized;
              }
            } else if (payload.eventType === 'UPDATE') {
              const idx = store.bookings.findIndex(b => b.id === payload.new.id || b.booking_ref === payload.new.booking_ref);
              const cust = store.customers.find(c => c.id === payload.new.customer_id);
              const crt = store.courts.find(c => c.id === payload.new.court_id);
              const normalized = {
                ...payload.new,
                customer_name: payload.new.customer_name || cust?.name || store.bookings[idx]?.customer_name || 'Customer',
                customer_phone: payload.new.customer_phone || cust?.phone || store.bookings[idx]?.customer_phone || '',
                court_name: payload.new.court_name || crt?.name || store.bookings[idx]?.court_name || 'Turf Court',
                booking_date: typeof payload.new.booking_date === 'string' ? payload.new.booking_date.slice(0, 10) : payload.new.booking_date,
                start_time: typeof payload.new.start_time === 'string' ? payload.new.start_time.slice(0, 5) : payload.new.start_time,
                end_time: typeof payload.new.end_time === 'string' ? payload.new.end_time.slice(0, 5) : payload.new.end_time,
                total_amount: Number(payload.new.total_amount),
                discount_amount: Number(payload.new.discount_amount || 0)
              };
              if (idx !== -1) {
                store.bookings[idx] = { ...store.bookings[idx], ...normalized };
              } else {
                store.bookings.unshift(normalized);
              }
            } else if (payload.eventType === 'DELETE') {
              store.bookings = store.bookings.filter(b => b.id !== payload.old.id);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const idx = store.customers.findIndex(c => c.id === payload.new.id || c.phone === payload.new.phone);
              if (idx !== -1) {
                store.customers[idx] = { ...store.customers[idx], ...payload.new };
              } else {
                store.customers.push(payload.new);
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'slot_locks' },
          (payload) => {
            console.log(`⚡ [Realtime DB Change] Slot Lock ${payload.eventType}:`, payload.new?.start_time || payload.old?.start_time);
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const key = `${payload.new.court_id}:${payload.new.date}:${payload.new.start_time}`;
              store.locks.set(key, {
                lockedBy: payload.new.locked_by,
                expiresAt: Number(payload.new.expires_at),
                courtId: payload.new.court_id,
                date: typeof payload.new.date === 'string' ? payload.new.date.slice(0, 10) : payload.new.date,
                startTime: typeof payload.new.start_time === 'string' ? payload.new.start_time.slice(0, 5) : payload.new.start_time
              });
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const key = `${payload.old.court_id}:${payload.old.date}:${payload.old.start_time}`;
              store.locks.delete(key);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'courts' },
          async (payload) => {
            console.log(`⚡ [Realtime DB Change] Courts ${payload.eventType}:`, payload.new?.name || payload.old?.id);
            if (payload.eventType === 'DELETE' && payload.old) {
              const deletedId = payload.old.id;
              store.courts = store.courts.filter(c => c.id !== deletedId);
              for (const [k, lock] of store.locks.entries()) {
                if (lock.courtId === deletedId) store.locks.delete(k);
              }
              console.log(`🗑️ [Realtime DB Change] Court ${deletedId} removed from WhatsApp server store. Remaining: ${store.courts.length}`);
            } else {
              await SupabaseService.refreshCourts(store);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sports' },
          async (payload) => {
            console.log(`⚡ [Realtime DB Change] Sports ${payload.eventType}:`, payload.new?.name || payload.old?.id);
            await SupabaseService.refreshSports(store);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'court_sports' },
          async (payload) => {
            console.log(`⚡ [Realtime DB Change] Court Sports ${payload.eventType}`);
            await SupabaseService.refreshCourts(store);
          }
        )
        .subscribe((status) => {
          console.log(`📡 Supabase Realtime status: ${status}`);
        });
    } catch (err) {
      console.warn('⚠️ Realtime subscription warning:', err.message);
    }
  }

  /**
   * Insert a new booking into Supabase
   */
  static async insertBooking(booking) {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      let notes = booking.notes || null;
      const otpCode = booking.gate_pass_otp || WhatsAppFormatter.getBookingGatePassOtp(booking);
      if (otpCode && otpCode !== '0000') {
        const strNotes = notes || '';
        if (!strNotes.includes('OTP:')) {
          notes = strNotes ? `${strNotes} | [OTP: ${otpCode}]` : `[OTP: ${otpCode}]`;
        }
      }

      const payload = {
        id: booking.id,
        booking_ref: booking.booking_ref,
        customer_id: booking.customer_id,
        court_id: booking.court_id,
        sport_id: booking.sport_id,
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        source: booking.source || 'offline_whatsapp',
        status: booking.status || 'pending_payment',
        total_amount: booking.total_amount,
        discount_amount: booking.discount_amount || 0,
        coupon_id: booking.coupon_id || null,
        created_by_admin_id: booking.created_by_admin_id || null,
        notes: notes,
        refund_amount: booking.refund_amount || 0,
        refund_reason: booking.refund_reason || null,
        refunded_at: booking.refunded_at || null,
        cancelled_by: booking.cancelled_by || null,
        cancelled_at: booking.cancelled_at || null,
        gateway_payment_id: booking.gateway_payment_id || null,
        created_at: booking.created_at || new Date().toISOString(),
        updated_at: booking.updated_at || new Date().toISOString()
      };

      const { data, error } = await supabase.from('bookings').upsert([payload], { onConflict: 'id' }).select().single();
      if (error) {
        console.error('❌ Supabase insertBooking error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('❌ Supabase insertBooking exception:', err.message);
      return null;
    }
  }

  /**
   * Update an existing booking in Supabase
   */
  static async updateBooking(bookingId, updates) {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      const payload = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('bookings')
        .update(payload)
        .or(`id.eq.${bookingId},booking_ref.eq.${bookingId}`)
        .select();

      if (error) {
        console.error('❌ Supabase updateBooking error:', error.message);
        return null;
      }
      return data?.[0] || null;
    } catch (err) {
      console.error('❌ Supabase updateBooking exception:', err.message);
      return null;
    }
  }

  /**
   * Upsert customer in Supabase safely without violating foreign keys
   */
  static async upsertCustomer(customer) {
    if (!isSupabaseConfigured() || !customer) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      const cleanPhone = customer.phone.startsWith('+') ? customer.phone : `+91${customer.phone.slice(-10)}`;

      // Check if customer exists by phone
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (existing) {
        // Keep existing customer ID to protect foreign key relationships
        customer.id = existing.id;
        const { id, created_at, ...updates } = customer;
        const { data, error } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.warn('⚠️ Supabase update customer warning:', error.message);
          return existing;
        }
        return data;
      } else {
        const payload = {
          ...customer,
          phone: cleanPhone,
          created_at: customer.created_at || new Date().toISOString()
        };
        const { data, error } = await supabase
          .from('customers')
          .insert([payload])
          .select()
          .single();

        if (error) {
          console.warn('⚠️ Supabase insert customer warning:', error.message);
          return null;
        }
        return data;
      }
    } catch (err) {
      console.warn('⚠️ Supabase upsertCustomer exception:', err.message);
      return null;
    }
  }

  /**
   * Record payment in Supabase
   */
  static async insertPayment(payment) {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      const { data, error } = await supabase.from('payments').insert([payment]).select().single();
      if (error) {
        console.error('❌ Supabase insertPayment error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('❌ Supabase insertPayment exception:', err.message);
      return null;
    }
  }

  /**
   * Persist a temporary 5-minute slot lock to Supabase
   */
  static async insertSlotLock({ court_id, date, start_time, locked_by, expires_at }) {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      const payload = {
        court_id,
        date,
        start_time,
        locked_by,
        expires_at
      };

      const { data, error } = await supabase
        .from('slot_locks')
        .upsert([payload], { onConflict: 'court_id,date,start_time' })
        .select();

      if (error) {
        console.warn('⚠️ Supabase insertSlotLock warning:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('⚠️ Supabase insertSlotLock exception:', err.message);
      return null;
    }
  }

  /**
   * Remove a slot lock from Supabase when expired or confirmed
   */
  static async deleteSlotLock(court_id, date, start_time) {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      if (!supabase) return null;

      const { data, error } = await supabase
        .from('slot_locks')
        .delete()
        .eq('court_id', court_id)
        .eq('date', date)
        .eq('start_time', start_time);

      if (error) {
        console.warn('⚠️ Supabase deleteSlotLock warning:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('⚠️ Supabase deleteSlotLock exception:', err.message);
      return null;
    }
  }

  /**
   * Re-fetch and refresh courts & junction sports from Supabase
   */
  /**
   * Re-fetch and refresh sports list from Supabase
   */
  static async refreshSports(store) {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: sports, error: sErr } = await supabase.from('sports').select('*');
      if (!sErr && sports && sports.length > 0) {
        store.sports = sports;
        console.log(`🔄 [Realtime DB Sync] Refreshed ${sports.length} sports from Supabase database.`);
      }
    } catch (err) {
      console.warn('⚠️ SupabaseService.refreshSports error:', err.message);
    }
  }

  static async refreshCourts(store) {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: sports, error: sErr } = await supabase.from('sports').select('*');
      if (!sErr && sports && sports.length > 0) {
        store.sports = sports;
      }

      const { data: courts, error: cErr } = await supabase.from('courts').select('*');
      const { data: courtSports, error: csErr } = await supabase.from('court_sports').select('*');

      if (!cErr && courts) {
        store.courts = courts
          .filter(c => c.status !== 'inactive')
          .sort((a, b) => {
            if (a.id === 'crt-001') return -1;
            if (b.id === 'crt-001') return 1;
            if (a.id === 'crt-002') return -1;
            if (b.id === 'crt-002') return 1;
            if (a.id === 'crt-003') return -1;
            if (b.id === 'crt-003') return 1;
            return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id));
          })
          .map(c => {
            const matchingSports = (courtSports || [])
              .filter(cs => cs.court_id === c.id)
              .map(cs => cs.sport_id);

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
              peak_enabled: Boolean(c.peak_enabled),
              peak_start_time: typeof c.peak_start_time === 'string' ? c.peak_start_time.slice(0, 5) : '18:00',
              peak_end_time: typeof c.peak_end_time === 'string' ? c.peak_end_time.slice(0, 5) : '23:00',
              peak_price_per_hour: Number(c.peak_price_per_hour) || 1800,
              peak_offer_price_per_hour: c.peak_offer_price_per_hour ? Number(c.peak_offer_price_per_hour) : undefined,
              offer_end_date: c.offer_end_date ? String(c.offer_end_date).slice(0, 10) : undefined,
              sport_ids: matchingSports.length > 0 ? matchingSports : ['sp-football']
            };
          });
        console.log(`🏟️ [SupabaseService] Refreshed courts count: ${store.courts.length}`);
      }
    } catch (err) {
      console.warn('⚠️ SupabaseService.refreshCourts error:', err.message);
    }
  }

  /**
   * Delete a court and all its child associations from Supabase
   */
  static async deleteCourt(courtId) {
    if (!isSupabaseConfigured()) return true;
    try {
      const supabase = getSupabase();
      if (!supabase) return true;

      // Delete child records first to satisfy FK constraints
      await Promise.allSettled([
        supabase.from('court_sports').delete().eq('court_id', courtId),
        supabase.from('pricing_rules').delete().eq('court_id', courtId),
        supabase.from('blocked_slots').delete().eq('court_id', courtId),
        supabase.from('slot_locks').delete().eq('court_id', courtId)
      ]);

      const { error } = await supabase.from('courts').delete().eq('id', courtId);
      if (error && error.code === '23503') {
        // If historical bookings prevent hard delete, mark inactive
        await supabase.from('courts').update({ status: 'inactive' }).eq('id', courtId);
      }
      return true;
    } catch (err) {
      console.warn('⚠️ SupabaseService.deleteCourt error:', err.message);
      return false;
    }
  }

  /**
   * Upsert a court and its sports junction into Supabase
   */
  static async upsertCourt(court) {
    if (!isSupabaseConfigured()) return true;
    try {
      const supabase = getSupabase();
      if (!supabase) return true;

      const payload = {
        id: court.id,
        venue_id: court.venue_id || 'ven-001',
        name: court.name,
        slot_duration_minutes: court.slot_duration_minutes || 60,
        opening_time: court.opening_time || '06:00',
        closing_time: court.closing_time || '23:00',
        buffer_minutes: court.buffer_minutes || 0,
        status: court.status || 'active',
        base_price_per_hour: court.base_price_per_hour || 1200,
        original_price_per_hour: court.original_price_per_hour || null,
        saturday_price_per_hour: court.saturday_price_per_hour || 1600,
        saturday_offer_price_per_hour: court.saturday_offer_price_per_hour || null,
        sunday_price_per_hour: court.sunday_price_per_hour || 1600,
        sunday_offer_price_per_hour: court.sunday_offer_price_per_hour || null,
        peak_enabled: Boolean(court.peak_enabled),
        peak_start_time: court.peak_start_time || '18:00',
        peak_end_time: court.peak_end_time || '23:00',
        peak_price_per_hour: court.peak_price_per_hour || 1800,
        peak_offer_price_per_hour: court.peak_offer_price_per_hour || null,
        offer_end_date: court.offer_end_date || null
      };

      await supabase.from('courts').upsert([payload], { onConflict: 'id' });

      if (Array.isArray(court.sport_ids) && court.sport_ids.length > 0) {
        await supabase.from('court_sports').delete().eq('court_id', court.id);
        const junction = court.sport_ids.map(sid => ({ court_id: court.id, sport_id: sid }));
        await supabase.from('court_sports').upsert(junction);
      }
      return true;
    } catch (err) {
      console.warn('⚠️ SupabaseService.upsertCourt error:', err.message);
      return false;
    }
  }
}
