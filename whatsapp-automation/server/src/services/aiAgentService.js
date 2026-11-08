// AI Agent Service: Intent Parsing, Dialog State & Tool Calling
import { store } from '../data/store.js';
import { SlotEngine } from './slotEngine.js';
import { BookingService } from './bookingService.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';
import { LockService } from './lockService.js';

export class AiAgentService {
  /**
   * Helper to parse relative date expressions (e.g. "today", "tomorrow", "friday", "2026-11-06")
   */
  static parseDate(text) {
    const lower = text.toLowerCase();
    const now = new Date();

    if (lower.includes('today') || lower.includes('aaj')) {
      return now.toISOString().slice(0, 10);
    }

    if (lower.includes('tomorrow') || lower.includes('kal')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().slice(0, 10);
    }

    if (lower.includes('day after tomorrow') || lower.includes('parso')) {
      const dayAfter = new Date(now);
      dayAfter.setDate(dayAfter.getDate() + 2);
      return dayAfter.toISOString().slice(0, 10);
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const targetDay = i;
        const currentDay = now.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7; // Next occurrence
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + diff);
        return targetDate.toISOString().slice(0, 10);
      }
    }

    // Direct YYYY-MM-DD
    const match = text.match(/\b(202\d-[0-1]\d-[0-3]\d)\b/);
    if (match) return match[1];

    // Default to tomorrow if not specified
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  /**
   * Helper to parse time expressions (e.g. "7pm", "19:00", "7:00 pm", "morning", "evening", "kal shaam 7 baje")
   * CC-A03: Defaults standalone 5-11 to PM and supports colloquial Indian phrases
   */
  static parseTime(text) {
    const lower = text.toLowerCase();
    const hasEveningContext = lower.includes('shaam') || lower.includes('evening') || lower.includes('raat') || lower.includes('night') || lower.includes('pm');
    const hasMorningContext = lower.includes('subah') || lower.includes('morning') || lower.includes('am');

    // 12-hour format e.g. "7pm", "7:00 pm", "7 pm", "10am"
    const match12 = lower.match(/\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/);
    if (match12) {
      let hour = parseInt(match12[1], 10);
      const min = match12[2] ? match12[2] : '00';
      const isPm = match12[3] === 'pm';
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${min}`;
    }

    // 24-hour format e.g. "19:00"
    const match24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (match24) {
      return `${String(match24[1]).padStart(2, '0')}:${match24[2]}`;
    }

    // Colloquial e.g. "7 baje", "8:30 baje"
    const matchBaje = lower.match(/\b([1-9]|1[0-2])(?::([0-5]\d))?\s*baje\b/);
    if (matchBaje) {
      let h = parseInt(matchBaje[1], 10);
      const min = matchBaje[2] ? matchBaje[2] : '00';
      if (hasEveningContext || (!hasMorningContext && h >= 5 && h <= 11)) {
        h += 12;
      }
      return `${String(h).padStart(2, '0')}:${min}`;
    }

    // Number with "at" or "for" e.g. "at 7", "for 8", "book 7"
    const matchNum = lower.match(/\b(?:at|for|book|slot)?\s*([1-9]|1[0-2])(?::([0-5]\d))?\s*(?:in the\s*(?:morning|evening|night))?\b/);
    if (matchNum && matchNum[1]) {
      let h = parseInt(matchNum[1], 10);
      const min = matchNum[2] ? matchNum[2] : '00';
      if (hasEveningContext || (!hasMorningContext && h >= 5 && h <= 11)) {
        h += 12;
      }
      return `${String(h).padStart(2, '0')}:${min}`;
    }

    return null;
  }

  /**
   * Main Conversational Agent Handler
   * Processes an incoming WhatsApp message and produces a context-aware response
   */
  static async handleIncomingMessage({ fromPhone, senderName, messageText }) {
    const text = (messageText || '').trim();
    const lower = text.toLowerCase();
    const phone = fromPhone.startsWith('+') ? fromPhone : `+91${fromPhone.slice(-10)}`;
    const name = senderName || 'Sports Player';

    console.log(`🤖 [AI AGENT INBOUND from ${name} (${phone})]: "${text}"`);

    // 1. GREETINGS & INTRO
    const isGreeting = (
      /^(hi|hello|hey|hii|heyy|yo|namaste|hlo|hola|start|menu|help|options)$/i.test(lower) ||
      lower.startsWith('good morning') ||
      lower.startsWith('good evening') ||
      lower.startsWith('good afternoon') ||
      ((lower.startsWith('hi ') || lower.startsWith('hello ') || lower.startsWith('hey ') || lower.startsWith('namaste ')) && text.length <= 25)
    );

    if (isGreeting) {
      const venue = store.getVenue();
      return {
        reply: `👋 *Welcome to ${venue.name}!* ⚽🏏🏸\n\n` +
          `Hi ${name !== 'Sports Player' ? name : 'there'}! How can I assist you today?\n\n` +
          `Please choose what you would like to do:\n\n` +
          `1️⃣ *Check Available Slots*\n` +
          `   _Reply *1* or e.g. "Football slots tomorrow"_\n\n` +
          `2️⃣ *Book Turf*\n` +
          `   _Reply *2* or e.g. "Book Turf A tomorrow at 8pm"_\n\n` +
          `3️⃣ *Show My Bookings*\n` +
          `   _Reply *3* or "My bookings"_\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 _You can also ask about *Pricing*, *Location*, or *Rules* anytime!_`,
        action: 'greeting'
      };
    }

    // MENU OPTION 1: CHECK AVAILABLE SLOTS
    if (lower === '1' || lower === 'check available slot' || lower === 'check available slots' || lower === 'check slot' || lower === 'check slots' || lower === 'available slots') {
      const parsedDate = this.parseDate('tomorrow');
      const availData = SlotEngine.getAvailableSlots(null, parsedDate, phone);
      const reply = WhatsAppFormatter.formatAvailableSlots(availData);
      return {
        reply: `📅 *Here are the available slots for tomorrow (${parsedDate}):*\n\n` + reply,
        action: 'check_availability',
        data: availData
      };
    }

    // MENU OPTION 2: BOOK TURF
    if (lower === '2' || lower === 'book turf' || lower === 'book court' || lower === 'book a turf' || lower === 'book a court') {
      const courts = store.getCourts();
      const courtList = courts.map(c => `• *${c.name}* (${c.sport_ids.join(', ')}) — ₹${c.base_price_per_hour}/hr`).join('\n');
      return {
        reply: `🏟️ *Book a Turf Slot:*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Our Courts:\n${courtList}\n\n` +
          `👉 *How to book:* Simply reply with the court name, date, and time:\n` +
          `• *"Book Turf A tomorrow at 8pm"*\n` +
          `• *"Book Turf B today at 6pm"*\n\n` +
          `Or reply *1* to check all available timings first!`,
        action: 'booking_prompt'
      };
    }

    // MENU OPTION 3: SHOW MY BOOKINGS
    if (lower === '3') {
      const bookings = BookingService.lookupBookings({ phone });
      return {
        reply: WhatsAppFormatter.formatCustomerBookings(bookings),
        action: 'lookup_bookings',
        data: bookings
      };
    }

    // 2. VENUE INFO, PRICING, DIRECTIONS, AMENITIES
    if (lower.includes('price') || lower.includes('cost') || lower.includes('rate') || lower.includes('charges')) {
      const venue = store.getVenue();
      const courts = store.getCourts();
      return {
        reply: WhatsAppFormatter.formatVenueInfo(venue, courts),
        action: 'pricing_info'
      };
    }

    if (lower.includes('location') || lower.includes('where') || lower.includes('address') || lower.includes('map') || lower.includes('direction')) {
      const venue = store.getVenue();
      return {
        reply: `📍 *Location & Directions for ${venue.name}:*\n\n` +
          `${venue.address}\n\n` +
          `🗺️ *Google Maps Pin:*\n${venue.google_maps_link}\n\n` +
          `🚗 Free parking is available inside the complex for both two-wheelers and four-wheelers.`,
        action: 'location_info'
      };
    }

    if (lower.includes('rule') || lower.includes('shoe') || lower.includes('stud') || lower.includes('amenities')) {
      const venue = store.getVenue();
      return {
        reply: `👟 *Pitch Rules & Amenities:*\n\n` +
          `✨ *Amenities:* ${venue.amenities.join(', ')}\n\n` +
          `⚠️ *Pitch Guidelines:*\n` +
          `• Turf shoes or flat rubber sole studs only (No metal spikes permitted).\n` +
          `• Free drinking water & changing rooms with showers provided.\n` +
          `• Footballs and bibs available on request at the dugout.`,
        action: 'rules_info'
      };
    }

    // 3. LOOKUP BOOKINGS
    if (lower.includes('my booking') || lower.includes('my bookings') || lower.includes('check booking') || lower.includes('booking status')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      const bookings = BookingService.lookupBookings({
        phone,
        ref: matchRef ? matchRef[0] : null
      });

      return {
        reply: WhatsAppFormatter.formatCustomerBookings(bookings),
        action: 'lookup_bookings',
        data: bookings
      };
    }

    // 4. CANCEL BOOKING (CC-A02: Mandatory Two-Step Confirmation Guardrail)
    if (lower.includes('cancel')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      if (!matchRef) {
        return {
          reply: `⚠️ Please provide your Booking Reference to cancel (e.g., *"Cancel TRF-20261105-1001"*).\n\n` +
            `Type *"My bookings"* if you need to find your reference number.`,
          action: 'cancel_need_ref'
        };
      }

      const bookingRef = matchRef[0].toUpperCase();
      const booking = store.getBookings().find(b => b.booking_ref === bookingRef);

      if (!booking) {
        return {
          reply: `⚠️ Booking *${bookingRef}* could not be found. Please check your reference code or type *"My bookings"*.`,
          action: 'cancel_not_found'
        };
      }

      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        return {
          reply: `ℹ️ Booking *${bookingRef}* is already cancelled (Refund recorded: ₹${booking.refund_amount || 0}).`,
          action: 'cancel_already_done'
        };
      }

      const isExplicitConfirmation = lower.includes('confirm cancel') || lower.includes('yes cancel') || lower.includes('confirm cancellation');

      // Step 1: User asked to cancel, but hasn't explicitly confirmed terms yet
      if (!isExplicitConfirmation) {
        const refundCalc = BookingService.calculateRefund(booking);
        return {
          reply: `⚠️ *Cancellation Policy & Refund Terms (CC-A02 Guardrail):*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎟️ *Booking Ref:* \`${bookingRef}\`\n` +
            `🏟️ *Court:* ${booking.court_name}\n` +
            `📅 *Match Date:* ${booking.booking_date} (${booking.start_time} - ${booking.end_time})\n` +
            `💰 *Original Paid:* ₹${booking.total_amount}\n` +
            `💸 *Refund Amount:* *₹${refundCalc.refundAmount}* (${refundCalc.refundPct}% tier, ${refundCalc.hoursRemaining} hrs notice)\n` +
            `⏱️ *Processing Timeline:* 5-7 business days\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Are you sure you want to cancel? To proceed with cancellation, please reply:\n` +
            `👉 *"CONFIRM CANCEL ${bookingRef}"*`,
          action: 'cancel_confirmation_prompt',
          data: { bookingRef, refundCalc }
        };
      }

      // Step 2: User explicitly confirmed! Execute cancellation
      const cancelRes = BookingService.cancelBooking(bookingRef, phone);
      return {
        reply: cancelRes.message,
        action: 'cancel_booking',
        success: cancelRes.success,
        data: cancelRes
      };
    }

    // 5. RESCHEDULE BOOKING
    if (lower.includes('reschedule') || lower.includes('postpone') || lower.includes('change time')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      const parsedTime = this.parseTime(text);
      const parsedDate = this.parseDate(text);

      if (!matchRef || !parsedTime) {
        return {
          reply: `🔄 *Reschedule Booking*\n` +
            `Please specify your booking reference, new date, and new time.\n\n` +
            `*Example:* *"Reschedule TRF-20261105-1001 to tomorrow at 8:00 PM"*`,
          action: 'reschedule_need_details'
        };
      }

      const bookingRef = matchRef[0].toUpperCase();
      const reschedRes = BookingService.rescheduleBooking(bookingRef, parsedDate, parsedTime);
      return {
        reply: reschedRes.message,
        action: 'reschedule_booking',
        success: reschedRes.success,
        data: reschedRes
      };
    }

    // 6. CONFIRM BOOKING (Instant Simulation / Razorpay Test Callback)
    if (lower.includes('confirm') && text.match(/TRF-\d{8}-\d{4}/i)) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i)[0].toUpperCase();
      const confRes = BookingService.confirmBooking(matchRef);
      return {
        reply: confRes.success ? `✅ Payment confirmed! Your booking ${matchRef} is locked in.` : confRes.message,
        action: 'confirm_booking',
        data: confRes
      };
    }

    // 7. INITIATE BOOKING (User wants to reserve a specific slot)
    // Matches expressions like: "book turf a tomorrow at 7pm", "reserve 8pm cricket", "book 19:00"
    if (lower.includes('book') || lower.includes('reserve') || lower.includes('block')) {
      const parsedDate = this.parseDate(text);
      const parsedTime = this.parseTime(text);

      if (!parsedTime) {
        return {
          reply: `⏰ What time would you like to play on ${parsedDate}?\n\n` +
            `You can reply e.g. *"Book Turf A at 7:00 PM"* or ask *"Show slots for ${parsedDate}"* to view all available timings.`,
          action: 'booking_need_time'
        };
      }

      // Identify Court
      const courts = store.getCourts();
      let court = courts[0]; // Default to Turf A
      if (lower.includes('turf b') || lower.includes('court 2') || lower.includes('multi-sport') || lower.includes('cricket')) {
        court = courts[1] || courts[0];
      } else if (lower.includes('badminton') || lower.includes('court 1') || lower.includes('wooden')) {
        court = courts[2] || courts[0];
      }

      const bookingRes = BookingService.initiateBooking({
        courtId: court.id,
        sportId: court.sport_ids[0],
        date: parsedDate,
        startTime: parsedTime,
        customerName: name,
        customerPhone: phone
      });

      if (!bookingRes.success) {
        // CC-A01: Retrieve fresh available alternatives immediately for stale asynchronous chat recovery
        const freshAvail = SlotEngine.getAvailableSlots(court.sport_ids[0], parsedDate, phone);
        const courtData = freshAvail.courts?.find(c => c.id === court.id);
        const openCourtSlots = courtData?.slots?.filter(s => s.status === 'available') || [];
        const timesText = openCourtSlots.slice(0, 4).map(s => `• \`${s.start_time}\` to \`${s.end_time}\` (₹${s.price})`).join('\n');

        return {
          reply: `⚠️ *Slot No Longer Available:*\n${bookingRes.message}\n\n` +
            (timesText ? `🏟️ *Remaining open timings on ${court.name} for ${parsedDate}:*\n${timesText}\n\n` : '') +
            `Reply with any of the available times above to lock it in! ⚽`,
          action: 'booking_conflict',
          alternatives: openCourtSlots
        };
      }

      return {
        reply: WhatsAppFormatter.formatPaymentCheckout({
          booking: bookingRes.booking,
          payment: bookingRes.payment
        }),
        action: 'booking_initiated',
        data: bookingRes
      };
    }

    // 8. CHECK AVAILABILITY (User asks for slots, timings, availability)
    const parsedDate = this.parseDate(text);
    let sportQuery = null;
    if (lower.includes('football')) sportQuery = 'football';
    else if (lower.includes('cricket')) sportQuery = 'cricket';
    else if (lower.includes('badminton')) sportQuery = 'badminton';
    else if (lower.includes('pickleball')) sportQuery = 'pickleball';

    const availData = SlotEngine.getAvailableSlots(sportQuery, parsedDate, phone);
    const reply = WhatsAppFormatter.formatAvailableSlots(availData);

    return {
      reply,
      action: 'check_availability',
      data: availData
    };
  }
}
