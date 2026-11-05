// WhatsApp Message Formatter & Interactive Message Payloads
// Formats plain text for standard chats & interactive JSON for Meta WhatsApp Cloud API

export class WhatsAppFormatter {
  /**
   * Format available slots into a clean WhatsApp message
   */
  static formatAvailableSlots({ sport, date, courts }) {
    let out = `🏆 *AVAILABLE SLOTS — ${date}*\n`;
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
        out += `  • \`${s.start_time}\` to \`${s.end_time}\` — *₹${s.price}* (${peakTag})\n`;
      }
      out += `\n`;
    }

    if (totalAvailable === 0) {
      out += `😔 Sorry, no slots are available for ${date}. Would you like to check another date?\n`;
    } else {
      out += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      out += `💡 *To book:* Just reply with the court name and time (e.g., *"Book Turf A at 7:00 PM"*).\n`;
      out += `⚡ Slots are reserved in real-time with a 5-min payment hold.`;
    }

    return out;
  }

  /**
   * Format booking checkout & payment link for WhatsApp
   */
  static formatPaymentCheckout({ booking, payment }) {
    return `💳 *RESERVATION PENDING PAYMENT*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎟️ *Ref:* \`${booking.booking_ref}\`\n` +
      `🏟️ *Court:* ${booking.court_name}\n` +
      `📅 *Date:* ${booking.booking_date}\n` +
      `⏰ *Time:* ${booking.start_time} — ${booking.end_time}\n` +
      `💰 *Total Amount:* ₹${booking.total_amount}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ *Slot Locked for 5 Minutes!*\n` +
      `Please complete payment to guarantee your slot:\n\n` +
      `👉 *Pay via Razorpay UPI / Card:*\n${payment.payment_url}\n\n` +
      `📱 *Instant UPI Payment Link:*\n${payment.upi_intent}\n\n` +
      `_Once paid, your booking will be instantly confirmed and your ticket dispatched here!_`;
  }

  /**
   * Format customer booking list
   */
  static formatCustomerBookings(bookings) {
    if (!bookings || bookings.length === 0) {
      return `ℹ️ You have no active or past bookings under this phone number. Reply *"Show slots for tomorrow"* to book your game!`;
    }

    let out = `📋 *YOUR TURFFLOW BOOKINGS*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const b of bookings) {
      const statusEmoji = b.status === 'confirmed' ? '✅' : b.status === 'pending_payment' ? '⏳' : b.status === 'cancelled' ? '❌' : '🏁';
      out += `${statusEmoji} *${b.booking_ref}* (${b.status.toUpperCase()})\n`;
      out += `🏟️ ${b.court_name}\n`;
      out += `📅 ${b.booking_date} | ⏰ ${b.start_time} — ${b.end_time}\n`;
      out += `💰 ₹${b.total_amount} | Source: ${b.source}\n`;
      if (b.status === 'confirmed') {
        out += `⚙️ _To cancel/reschedule reply: "Cancel ${b.booking_ref}"_\n`;
      }
      out += `─────────────────────────\n`;
    }
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
      out += `  • *${c.name}:* ₹${c.base_price_per_hour}/hr (Weekday) | ₹${c.peak_price_per_hour || c.base_price_per_hour}/hr (Peak 6PM-11PM)\n`;
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
