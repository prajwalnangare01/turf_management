// WhatsApp Message Formatter & Interactive Message Payloads
// Formats plain text for standard chats & interactive JSON for Meta WhatsApp Cloud API
import { store } from '../data/store.js';

export class WhatsAppFormatter {
  /**
   * Helper to format human-readable sport label (with emoji) for a court
   */
  static getCourtSportsLabel(court) {
    if (!court) return '';
    if (court.sport_name) return court.sport_name;
    if (Array.isArray(court.sports) && court.sports.length > 0) {
      return court.sports.map(s => `${s.icon ? s.icon + ' ' : ''}${s.name}`).join(', ');
    }
    const allSports = store.getSports();
    let ids = court.sport_ids;
    if (!ids && court.court_id) {
      const found = store.getCourts().find(c => c.id === court.court_id);
      ids = found?.sport_ids;
    }
    if (Array.isArray(ids) && ids.length > 0) {
      const matched = allSports.filter(s => ids.includes(s.id));
      if (matched.length > 0) {
        return matched.map(s => `${s.icon ? s.icon + ' ' : ''}${s.name}`).join(', ');
      }
    }
    return '';
  }

  /**
   * Convert any date (YYYY-MM-DD, ISO string, Date) to DD/MM/YYYY
   */
  static formatDate(dateStr) {
    if (!dateStr) return '';
    const cleanStr = String(dateStr).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) return cleanStr;
    const match = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return cleanStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Convert 24h time "HH:mm" to 12h format "hh:mm AM/PM"
   */
  static formatTime(timeStr) {
    if (!timeStr) return '';
    const cleanStr = String(timeStr).trim();
    if (/am|pm/i.test(cleanStr)) return cleanStr;
    const parts = cleanStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    if (isNaN(h)) return cleanStr;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const formattedH = h12 < 10 ? `0${h12}` : `${h12}`;
    return `${formattedH}:${m} ${period}`;
  }

  /**
   * Format available slots into a clean WhatsApp message
   */
  static formatAvailableSlots({ sport, date, courts }) {
    const formattedDate = this.formatDate(date);
    let out = `🏆 *AVAILABLE SLOTS — ${formattedDate}*\n`;
    if (sport) {
      out += `Sport: *${sport.icon} ${sport.name}*\n`;
    }
    out += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let totalAvailable = 0;

    for (const c of courts) {
      const sportLabel = this.getCourtSportsLabel(c);
      out += `🏟️ *${c.court_name}*\n`;
      if (sportLabel) {
        out += `🏅 *Sport:* ${sportLabel}\n`;
      }
      if (c.slots.length === 0) {
        out += `  _No slots open on this date_\n\n`;
        continue;
      }

      for (const s of c.slots) {
        totalAvailable++;
        const peakTag = s.is_peak ? '🔥 *Peak*' : '🟢 Regular';
        const start12 = this.formatTime(s.start_time);
        const end12 = this.formatTime(s.end_time);
        out += `  • \`${start12}\` to \`${end12}\` — *₹${s.price}* (${peakTag})\n`;
      }
      out += `\n`;
    }

    if (totalAvailable === 0) {
      out += `😔 Sorry, no slots are available for ${formattedDate}.\n\n` +
        `👉 Reply *1* to select another date, or reply *menu* for main options.\n`;
    } else {
      const exampleCourt = courts[0]?.court_name?.split(/[—–\-]/)[0].trim() || 'Turf A';
      out += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      out += `💡 *To book:* Just reply with the court name and time (e.g., *"Book ${exampleCourt} at 7:00 PM"*).\n`;
      out += `⚡ Slots are reserved in real-time with a 5-min payment hold.`;
    }

    return out;
  }

  /**
   * Format booking checkout & payment link for WhatsApp
   * Note: Pre-payment reference is deliberately hidden to prevent leaking Gate Pass OTP before payment
   */
  static formatPaymentCheckout({ booking, payment }) {
    const formattedDate = this.formatDate(booking.booking_date);
    const start12 = this.formatTime(booking.start_time);
    const end12 = this.formatTime(booking.end_time);

    return `💳 *RESERVATION PENDING PAYMENT*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏟️ *Court:* ${booking.court_name}\n` +
      `📅 *Date:* ${formattedDate}\n` +
      `⏰ *Time:* ${start12} — ${end12}\n` +
      `💰 *Total Amount:* ₹${booking.total_amount}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ *Slot Locked for 5 Minutes!*\n` +
      `Please complete payment below to guarantee your reservation:\n\n` +
      `👉 *Pay via Razorpay UPI / Card:*\n${payment.payment_url}\n\n` +
      `📱 *Instant UPI Payment Link:*\n${payment.upi_intent}\n\n` +
      `🔒 _Your official Gate Pass & Entry OTP will be generated and dispatched here immediately after payment is completed._`;
  }

  /**
   * Format customer booking list
   */
  static formatCustomerBookings(bookings) {
    if (!bookings || bookings.length === 0) {
      return `ℹ️ You have no pending or upcoming bookings.\n_(Completed and cancelled bookings are hidden to keep your chat clean)._\n\n👉 Reply *1* or *"Book Turf"* to reserve your slot! ⚽🏏`;
    }

    let out = `📋 *YOUR ACTIVE & PENDING BOOKINGS*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const b of bookings) {
      const isConfirmed = b.status === 'confirmed';
      const otpCode = WhatsAppFormatter.getBookingGatePassOtp(b);
      const formattedDate = this.formatDate(b.booking_date);
      const validSlots = Array.isArray(b.all_slots) ? b.all_slots.filter(s => s.start_time && s.end_time) : [];
      const slotTimeStr = (b.start_time && b.end_time)
        ? `${this.formatTime(b.start_time)} — ${this.formatTime(b.end_time)}`
        : (validSlots.length > 0
            ? validSlots.map(s => `${this.formatTime(s.start_time)} — ${this.formatTime(s.end_time)}`).join(', ')
            : (b.formatted_slots && !b.formatted_slots.includes('undefined') && b.formatted_slots.trim() !== '–' ? b.formatted_slots : 'Time slot confirmed'));

      if (isConfirmed) {
        out += `✅ *CONFIRMED MATCH RESERVATION*\n`;
        out += `🏟️ ${b.court_name}\n`;
        out += `📅 ${formattedDate} | ⏰ ${slotTimeStr}\n`;
        out += `🔑 *Gate Pass OTP:* *${otpCode}*\n`;
        out += `💰 ₹${b.total_order_amount || b.total_amount || 0} (PAID)\n`;
        out += `📄 *Download PDF Pass:* http://localhost:5000/api/bookings/${b.booking_ref}/pass\n`;
        out += `⚙️ _To cancel/reschedule, reply: "Cancel ${otpCode}"_\n`;
      } else {
        out += `⏳ *PENDING RESERVATION*\n`;
        out += `🏟️ ${b.court_name}\n`;
        out += `📅 ${formattedDate} | ⏰ ${slotTimeStr}\n`;
        out += `💰 ₹${b.total_amount} (5-min hold active)\n`;
        const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
        const payKey = b.id || b.booking_ref;
        out += `👉 *Complete Payment:* ${baseUrl}/pay/${payKey}\n`;
      }
      out += `─────────────────────────\n`;
    }
    out += `\n💡 _Completed & past matches are automatically hidden._`;
    return out;
  }

  /**
   * Format venue FAQs, rules & pricing
   */
  static formatVenueInfo(venue, courts) {
    let out = `🏟️ *WELCOME TO ${venue.name.toUpperCase()}* 🏟️\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Address:* ${venue.address}\n` +
      `🗺️ *Map:* ${venue.location_url || venue.google_maps_link}\n` +
      `📞 *Helpdesk:* ${venue.contact_phone}\n` +
      `⏰ *Hours:* 06:00 AM — 11:00 PM (Daily)\n\n` +
      `✨ *Amenities:*\n`;

    for (const a of venue.amenities) {
      out += `  ✅ ${a}\n`;
    }

    out += `\n📋 *Rules & Guidelines:*\n`;
    for (const r of venue.rules) {
      out += `  ⚠️ ${r}\n`;
    }

    out += `\n💰 *Pricing Breakdown:*\n`;
    for (const c of courts) {
      const origText = (c.original_price_per_hour && c.original_price_per_hour > c.base_price_per_hour)
        ? ` ~₹${c.original_price_per_hour}~`
        : '';
      const peakRate = c.peak_price_per_hour || 1800;
      let pkOffer = c.peak_offer_price_per_hour;
      if (pkOffer === undefined && c.original_price_per_hour && c.original_price_per_hour > c.base_price_per_hour) {
        const discountRatio = (c.original_price_per_hour - c.base_price_per_hour) / c.original_price_per_hour;
        pkOffer = Math.round(peakRate * (1 - discountRatio));
      }
      const effectivePeak = (pkOffer && pkOffer !== peakRate)
        ? `~₹${Math.max(peakRate, pkOffer)}~ ₹${Math.min(peakRate, pkOffer)}`
        : `₹${peakRate}`;
      const sportLabel = this.getCourtSportsLabel(c);
      out += `  • *${c.name}*${sportLabel ? ` (${sportLabel})` : ''}:${origText} ₹${c.base_price_per_hour}/hr (Weekday) | ${effectivePeak}/hr (Peak 6:00 PM - 11:00 PM)\n`;
    }

    out += `\n🔄 *Cancellation Policy:*\n` +
      `  • >24 hrs prior: 100% Refund\n` +
      `  • 6-24 hrs prior: 50% Refund\n` +
      `  • <6 hrs prior: Non-refundable\n\n` +
      `Reply with the sport or date you want to play!`;

    return out;
  }

  /**
   * Meta WhatsApp Cloud API: Interactive Button Message Payload
   */
  static toMetaButtonMessage(recipientPhone, bodyText, buttons) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn, i) => ({
            type: 'reply',
            reply: {
              id: btn.id || `btn_${i}`,
              title: btn.title.slice(0, 20)
            }
          }))
        }
      }
    };
  }

  /**
   * Meta WhatsApp Cloud API: Interactive List Message Payload
   */
  static toMetaListMessage(recipientPhone, headerText, bodyText, buttonText, sections) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections
        }
      }
    };
  }

  /**
   * Universal Gate Pass OTP resolver for multi-slot and sibling bookings
   */
  static getBookingGatePassOtp(booking) {
    if (!booking) return '0000';
    // 1. If explicit gate_pass_otp exists and is valid 4 digits
    if (booking.gate_pass_otp && /^\d{4}$/.test(String(booking.gate_pass_otp).trim())) {
      return String(booking.gate_pass_otp).trim();
    }
    // 2. Check if OTP is tagged in notes (e.g. "[OTP: 7341]" or "OTP: 7341")
    if (booking.notes) {
      const match = String(booking.notes).match(/\bOTP[:\s-]+([0-9]{4})\b/i);
      if (match) return match[1];
    }
    // 3. Derive directly from group_ref or base booking_ref trailing 4 digits
    const rawRef = (booking.group_ref || booking.booking_ref || booking.id || '').toString().trim();
    if (rawRef) {
      const siblingMatch = rawRef.match(/^(.*-\d{4})-\d+$/);
      const baseRef = siblingMatch ? siblingMatch[1] : rawRef;
      const trailingDigitsMatch = baseRef.match(/\d{4}$/);
      if (trailingDigitsMatch) return trailingDigitsMatch[0];
      const allDigits = baseRef.replace(/\D/g, '');
      if (allDigits.length >= 4) return allDigits.slice(-4);
    }
    return rawRef.slice(-4) || '0000';
  }

  /**
   * Universal booking group reference normalizer
   */
  static getBookingGroupRef(booking) {
    if (!booking) return '';
    const raw = (booking.group_ref || booking.booking_ref || booking.id || '').toString().trim();
    const siblingMatch = raw.match(/^(.*-\d{4})-\d+$/);
    return siblingMatch ? siblingMatch[1] : raw;
  }
}

export const getBookingGatePassOtp = WhatsAppFormatter.getBookingGatePassOtp;
export const getBookingGroupRef = WhatsAppFormatter.getBookingGroupRef;

