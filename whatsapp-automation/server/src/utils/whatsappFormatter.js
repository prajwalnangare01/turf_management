// WhatsApp Message Formatter & Interactive Message Payloads
// Formats plain text for standard chats & interactive JSON for Meta WhatsApp Cloud API

export class WhatsAppFormatter {
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
      out += `🏟️ *${c.court_name}*\n`;
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
      out += `😔 Sorry, no slots are available for ${formattedDate}. Would you like to check another date?\n`;
    } else {
      out += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      out += `💡 *To book:* Just reply with the court name and time (e.g., *"Book Turf A at 7:00 PM"*).\n`;
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
      const otpCode = b.gate_pass_otp || (b.booking_ref ? b.booking_ref.slice(-4) : '0000');
      const formattedDate = this.formatDate(b.booking_date);
      const start12 = this.formatTime(b.start_time);
      const end12 = this.formatTime(b.end_time);

      if (isConfirmed) {
        out += `✅ *${b.booking_ref}* (UPCOMING MATCH)\n`;
        out += `🏟️ ${b.court_name}\n`;
        out += `📅 ${formattedDate} | ⏰ ${start12} — ${end12}\n`;
        out += `🔑 *Gate Pass OTP:* *${otpCode}*\n`;
        out += `💰 ₹${b.total_amount} (PAID)\n`;
        out += `📄 *Download PDF Pass:* http://localhost:5000/api/bookings/${b.booking_ref}/pass\n`;
        out += `⚙️ _To cancel/reschedule, reply: "Cancel ${b.booking_ref}"_\n`;
      } else {
        out += `⏳ *PENDING RESERVATION*\n`;
        out += `🏟️ ${b.court_name}\n`;
        out += `📅 ${formattedDate} | ⏰ ${start12} — ${end12}\n`;
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
      `🗺️ *Map:* ${venue.google_maps_link}\n` +
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
      out += `  • *${c.name}:* ₹${c.base_price_per_hour}/hr (Weekday) | ₹${c.peak_price_per_hour || c.base_price_per_hour}/hr (Peak 6:00 PM - 11:00 PM)\n`;
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
}
