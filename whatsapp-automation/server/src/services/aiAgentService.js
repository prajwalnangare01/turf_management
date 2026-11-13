// AI Agent Service: Intent Parsing, Multi-Step Dialog State & Tool Calling
import { store } from '../data/store.js';
import { SlotEngine } from './slotEngine.js';
import { BookingService } from './bookingService.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';
import { LockService } from './lockService.js';
import { getVenueNow, getVenueDateString, getVenueMinutesFromMidnight } from '../utils/venueTime.js';

// In-memory conversation state machine per customer phone
const dialogSessions = new Map();

export class AiAgentService {
  /**
   * Helper to parse relative date expressions (e.g. "today", "tomorrow", "friday", "2026-11-06", "15 Nov")
   * @param {string} text
   * @param {boolean} strict - if true, returns null when unrecognized instead of defaulting to today
   */
  static parseDate(text, strict = false) {
    if (!text) return strict ? null : getVenueDateString(0);
    const lower = text.toLowerCase().trim();

    if (lower === '1' || lower === 'today' || lower === 'aaj') {
      return getVenueDateString(0);
    }

    if (lower === '2' || lower === 'tomorrow' || lower === 'kal') {
      return getVenueDateString(1);
    }

    if (lower === '3' || lower === 'day after tomorrow' || lower === 'parso') {
      return getVenueDateString(2);
    }

    if (lower.includes('today') || lower.includes('aaj')) {
      return getVenueDateString(0);
    }

    if (lower.includes('tomorrow') || lower.includes('kal')) {
      return getVenueDateString(1);
    }

    if (lower.includes('day after tomorrow') || lower.includes('parso')) {
      return getVenueDateString(2);
    }

    const vNow = getVenueNow();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const targetDay = i;
        const currentDay = vNow.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7; // Next occurrence
        return getVenueDateString(diff);
      }
    }

    // 1. Direct YYYY-MM-DD or YYYY/MM/DD (e.g. 2026-12-05 or 2026/12/05)
    const matchYMD = text.match(/\b(202\d)[\/\-]([0-1]\d)[\/\-]([0-3]\d)\b/);
    if (matchYMD) {
      return `${matchYMD[1]}-${matchYMD[2]}-${matchYMD[3]}`;
    }

    // 2. Direct DD/MM/YYYY or DD-MM-YYYY (e.g. 10/11/2026 or 10-11-2026 or 10/11)
    const matchDMY = text.match(/\b([0-3]?\d)[\/\-]([0-1]?\d)(?:[\/\-](202\d))?\b/);
    if (matchDMY) {
      const d = String(matchDMY[1]).padStart(2, '0');
      const m = String(matchDMY[2]).padStart(2, '0');
      const y = matchDMY[3] || String(vNow.getFullYear());
      return `${y}-${m}-${d}`;
    }

    // Day + Month e.g. "15 Nov", "15th November", "Nov 15"
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const matchDayMonth = text.match(/\b([0-3]?\d)(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\b/i);
    if (matchDayMonth) {
      const d = String(matchDayMonth[1]).padStart(2, '0');
      const monthPrefix = matchDayMonth[2].toLowerCase().slice(0, 3);
      const mIdx = months.indexOf(monthPrefix);
      if (mIdx !== -1) {
        const m = String(mIdx + 1).padStart(2, '0');
        const y = vNow.getFullYear();
        return `${y}-${m}-${d}`;
      }
    }

    const matchMonthDay = text.match(/\b([a-zA-Z]{3,9})\s+([0-3]?\d)(?:st|nd|rd|th)?\b/i);
    if (matchMonthDay) {
      const monthPrefix = matchMonthDay[1].toLowerCase().slice(0, 3);
      const d = String(matchMonthDay[2]).padStart(2, '0');
      const mIdx = months.indexOf(monthPrefix);
      if (mIdx !== -1) {
        const m = String(mIdx + 1).padStart(2, '0');
        const y = vNow.getFullYear();
        return `${y}-${m}-${d}`;
      }
    }

    if (strict) return null;

    // Default fallback to today
    return getVenueDateString(0);
  }

  /**
   * Validate that date is within today and the next 10 days
   */
  static validate10DayWindow(dateStr) {
    const todayStr = getVenueDateString(0);
    const maxDateStr = getVenueDateString(10);

    if (dateStr < todayStr) {
      return { valid: false, reason: 'past', todayStr, maxDateStr };
    }
    if (dateStr > maxDateStr) {
      return { valid: false, reason: 'exceeds_10_days', todayStr, maxDateStr };
    }
    return { valid: true, todayStr, maxDateStr };
  }

  /**
   * Helper to parse time expressions (e.g. "7pm", "19:00", "7:00 pm", "morning", "evening", "kal shaam 7 baje")
   * IMPORTANT: Single digits ("1", "2", "3") without prefix or am/pm are menu responses and NEVER parsed as time.
   */
  static parseTime(text) {
    if (!text) return null;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // STRICT GUARD: Single isolated digits or menu inputs (e.g. "1", "2", "3", "0") are NEVER times!
    if (/^[0-9]$/.test(trimmed)) {
      return null;
    }

    const hasEveningContext = lower.includes('shaam') || lower.includes('evening') || lower.includes('raat') || lower.includes('night') || lower.includes('pm');
    const hasMorningContext = lower.includes('subah') || lower.includes('morning') || lower.includes('am');

    // 1. Explicit 12-hour format e.g. "7pm", "7:00 pm", "7 pm", "10am", "10:30am"
    const match12 = lower.match(/\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/);
    if (match12) {
      let hour = parseInt(match12[1], 10);
      const min = match12[2] ? match12[2] : '00';
      const isPm = match12[3] === 'pm';
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${min}`;
    }

    // 2. Explicit 24-hour format e.g. "19:00", "07:00"
    const match24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (match24) {
      return `${String(match24[1]).padStart(2, '0')}:${match24[2]}`;
    }

    // 3. Colloquial Indian format e.g. "7 baje", "8:30 baje", "8 baje raat"
    const matchBaje = lower.match(/\b([1-9]|1[0-2])(?::([0-5]\d))?\s*baje\b/);
    if (matchBaje) {
      let h = parseInt(matchBaje[1], 10);
      const min = matchBaje[2] ? matchBaje[2] : '00';
      if (hasEveningContext || (!hasMorningContext && (h <= 5 || h >= 6))) {
        if (h < 12) h += 12;
      }
      return `${String(h).padStart(2, '0')}:${min}`;
    }

    // 4. Number with MANDATORY prefix "at", "for", "slot" or court name, e.g. "at 7", "for 8", "slot 6", "turf a 7"
    // MUST NOT match isolated numbers without prefix!
    const matchPrefixed = lower.match(/\b(?:at|for|slot|turf\s*[ab12]|pitch\s*[ab12]|court\s*\d|running\s*pitch)\s+([1-9]|1[0-2])(?::([0-5]\d))?(?:\s*(?:in the\s*(?:morning|evening|night)))?\b/);
    if (matchPrefixed && matchPrefixed[1]) {
      let h = parseInt(matchPrefixed[1], 10);
      const min = matchPrefixed[2] ? matchPrefixed[2] : '00';
      // In sports turf context (open 6:00 to 23:00):
      // If user says "at 7" without morning context, default to 19:00 (7 PM evening peak)
      // If user says "at 1" or "at 2" or "at 3" or "at 4" or "at 5", it's 13:00, 14:00, etc. (afternoon)
      if (hasEveningContext || (!hasMorningContext && (h <= 5 || h >= 6))) {
        if (h < 12) h += 12;
      }
      return `${String(h).padStart(2, '0')}:${min}`;
    }

    return null;
  }

  /**
   * Helper to resolve the most appropriate court from user text
   * @param {string} text - user input text
   * @param {Array} courts - list of active courts
   * @param {boolean} fallbackToDefault - if true, returns primary court when no specific court matched
   * @returns {Object|null} matched court
   */
  static resolveCourt(text, courts, fallbackToDefault = true) {
    if (!courts || courts.length === 0) return null;
    const lower = (text || '').toLowerCase().trim();

    // 1. Explicit match for Turf A / Pitch A / 5-a-side / FIFA
    if (/\b(turf\s*[a1]|pitch\s*[a1]|court\s*a|fifa|5[- ]?a[- ]?side)\b/i.test(lower)) {
      const match = courts.find(c => c.id === 'crt-001' || /\bturf\s*a\b/i.test(c.name));
      if (match) return match;
    }

    // 2. Explicit match for Turf B / Pitch B / Multi-Sport / Cricket
    if (/\b(turf\s*[b2]|pitch\s*[b2]|court\s*[b2]|multi[- ]?sport|box\s*cricket|cricket)\b/i.test(lower)) {
      const match = courts.find(c => c.id === 'crt-002' || /\bturf\s*b\b/i.test(c.name));
      if (match) return match;
    }

    // 3. Explicit match for Badminton / Court 1 / Wooden / BWF
    if (/\b(court\s*1|badminton|bwf|indoor\s*wooden|wooden)\b/i.test(lower)) {
      const match = courts.find(c => 
        c.sport_ids?.includes('sp-badminton') || 
        c.id === 'crt-003' || 
        /badminton|wooden/i.test(c.name)
      );
      if (match) return match;
    }

    // 4. Explicit match for Pickleball
    if (/\b(pickleball|paddle|pickle)\b/i.test(lower)) {
      const match = courts.find(c => 
        c.sport_ids?.includes('sp-pickleball') || 
        /pickleball/i.test(c.name)
      );
      if (match) return match;
    }

    // 5. Match by Court Name prefix or distinct keywords for custom/dynamically added courts
    for (const c of courts) {
      const baseName = c.name.split(/[—–\-]/)[0].trim().toLowerCase();
      // Match base name if length >= 3
      if (baseName.length >= 3 && lower.includes(baseName)) {
        return c;
      }
      // Check distinctive keywords (e.g. "running", "volly")
      const words = baseName.split(/\s+/).filter(w => w.length >= 4 && !['turf', 'court', 'pitch', 'arena'].includes(w));
      for (const w of words) {
        const regex = new RegExp(`\\b${w}\\b`, 'i');
        if (regex.test(lower)) {
          return c;
        }
      }
    }

    // 6. Match by sport keyword if mentioned (e.g. "football", "soccer")
    if (/\b(football|soccer)\b/i.test(lower)) {
      const footballCourt = courts.find(c => c.id === 'crt-001' || c.sport_ids?.includes('sp-football'));
      if (footballCourt) return footballCourt;
    }

    if (!fallbackToDefault) return null;

    // 7. Default fallback:
    // If user didn't specify a court, default to primary Turf A ('crt-001') if available, otherwise first active court
    const defaultCourt = courts.find(c => c.id === 'crt-001') || 
                          courts.find(c => /\bturf\s*a\b/i.test(c.name)) || 
                          courts[0];
    return defaultCourt;
  }

  /**
   * Helper to format main menu greeting
   */
  static getMainMenuText(customerName) {
    const venue = store.getVenue();
    const displayName = customerName && customerName !== 'Sports Player' ? customerName : 'there';

    return `👋 *Welcome to ${venue.name}!* ⚽🏏🏸\n\n` +
      `Hi ${displayName}! How can I assist you today?\n\n` +
      `Please choose what you would like to do:\n\n` +
      `1️⃣ *Book Turf*\n` +
      `2️⃣ *Show available slots for today*\n` +
      `3️⃣ *Show my bookings*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 _Reply *1*, *2*, or *3* to choose!_`;
  }

  /**
   * Helper to format date selection prompt
   */
  static getDateSelectionPrompt() {
    return `📅 *Select Date for Booking:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `1️⃣ *Today*\n` +
      `2️⃣ *Tomorrow*\n` +
      `3️⃣ *Any other date* (must be in next 10 days)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 _Reply *1* for Today, *2* for Tomorrow, or *3* for another date._`;
  }

  /**
   * Helper to retrieve available sports supported by active courts
   */
  static getAvailableSports() {
    const allSports = store.getSports();
    const activeCourts = store.getCourts().filter(c => c.status === 'active');
    const sportsWithCourts = allSports.filter(s =>
      activeCourts.some(c => c.sport_ids && c.sport_ids.includes(s.id))
    );
    return sportsWithCourts.length > 0 ? sportsWithCourts : allSports;
  }

  /**
   * Helper to format sport selection prompt for a given date
   */
  static getSportSelectionPrompt(dateStr) {
    const sports = this.getAvailableSports();
    const formattedDate = WhatsAppFormatter.formatDate(dateStr);
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    const sportLines = sports.map((s, idx) => {
      const numEmoji = numberEmojis[idx] || `${idx + 1}️⃣`;
      const icon = s.icon ? `${s.icon} ` : '';
      return `${numEmoji} ${icon}*${s.name}*`;
    }).join('\n');

    return `🏆 *Select Sport for ${formattedDate}:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${sportLines}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 _Reply with the number (e.g. *1*) or sport name._\n` +
      `_(Or reply *date* to change date, or *menu* for main options)_`;
  }

  /**
   * Helper to resolve sport from user input (number or text name/alias)
   */
  static resolveSportFromInput(text) {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    const sports = this.getAvailableSports();

    // 1. Match by number (1-based index)
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num >= 1 && num <= sports.length) {
      return sports[num - 1];
    }

    // 2. Match by exact or partial sport name or id
    for (const s of sports) {
      const sName = s.name.toLowerCase();
      if (lower === sName || lower.includes(sName) || lower === s.id.toLowerCase()) {
        return s;
      }
    }

    // 3. Match common synonyms
    if (lower.includes('soccer')) {
      return sports.find(s => s.name.toLowerCase().includes('football') || s.id === 'sp-football') || null;
    }
    if (lower.includes('box cricket')) {
      return sports.find(s => s.name.toLowerCase().includes('cricket') || s.id === 'sp-cricket') || null;
    }
    if (lower.includes('shuttle')) {
      return sports.find(s => s.name.toLowerCase().includes('badminton') || s.id === 'sp-badminton') || null;
    }
    if (lower.includes('paddle') || lower.includes('pickle')) {
      return sports.find(s => s.name.toLowerCase().includes('pickleball') || s.id === 'sp-pickleball') || null;
    }

    return null;
  }


  /**
   * Main Conversational Agent Handler
   */
  static async handleIncomingMessage({ fromPhone, senderName, messageText }) {
    const text = (messageText || '').trim();
    const lower = text.toLowerCase();
    const phone = fromPhone.startsWith('+') ? fromPhone : `+91${fromPhone.slice(-10)}`;
    const name = senderName || 'Sports Player';

    console.log(`🤖 [AI AGENT INBOUND from ${name} (${phone})]: "${text}"`);

    // Retrieve active dialog session (expire if older than 15 minutes)
    let session = dialogSessions.get(phone);
    if (session && Date.now() - session.updatedAt > 15 * 60 * 1000) {
      dialogSessions.delete(phone);
      session = null;
    }

    // 1. GLOBAL GREETING / RESET COMMANDS
    const isGreetingOrReset = (
      /^(hi|hello|hey|hii|heyy|yo|namaste|hlo|hola|start|menu|options|help|0)$/i.test(lower) ||
      lower.startsWith('good morning') ||
      lower.startsWith('good evening') ||
      lower.startsWith('good afternoon') ||
      ((lower.startsWith('hi ') || lower.startsWith('hello ') || lower.startsWith('hey ') || lower.startsWith('namaste ')) && text.length <= 25)
    );

    if (isGreetingOrReset) {
      dialogSessions.delete(phone);
      return {
        reply: this.getMainMenuText(name),
        action: 'greeting'
      };
    }

    // 2. ACTIVE MULTI-STEP DIALOG HANDLING
    if (session) {
      // Step A: User is picking Date (1. Today, 2. Tomorrow, 3. Any other date)
      if (session.step === 'awaiting_date_choice') {
        const todayStr = getVenueDateString(0);
        const tomorrowStr = getVenueDateString(1);

        if (lower === '1' || lower === 'today' || lower === 'aaj') {
          dialogSessions.set(phone, {
            step: 'awaiting_sport_choice',
            date: todayStr,
            updatedAt: Date.now()
          });
          return {
            reply: this.getSportSelectionPrompt(todayStr),
            action: 'select_sport_prompt',
            date: todayStr
          };
        }

        if (lower === '2' || lower === 'tomorrow' || lower === 'kal') {
          dialogSessions.set(phone, {
            step: 'awaiting_sport_choice',
            date: tomorrowStr,
            updatedAt: Date.now()
          });
          return {
            reply: this.getSportSelectionPrompt(tomorrowStr),
            action: 'select_sport_prompt',
            date: tomorrowStr
          };
        }

        if (lower === '3' || lower === 'any other date' || lower === 'other' || lower === 'other date') {
          dialogSessions.set(phone, { step: 'awaiting_custom_date', updatedAt: Date.now() });
          return {
            reply: `📅 *Please enter your desired booking date:*\n` +
              `_(Must be within the next 10 days, e.g. *${WhatsAppFormatter.formatDate(tomorrowStr)}*, *15/11/2026*, or *Friday*)\n\n` +
              `👉 Type the date below:`,
            action: 'awaiting_custom_date'
          };
        }

        // Direct date attempt while in date selection
        const directParsedDate = this.parseDate(text, true);
        if (directParsedDate) {
          const windowCheck = this.validate10DayWindow(directParsedDate);
          if (!windowCheck.valid) {
            if (windowCheck.reason === 'past') {
              return {
                reply: `⚠️ That date has already passed. Please select a date between today and ${WhatsAppFormatter.formatDate(windowCheck.maxDateStr)}:\n\n` + this.getDateSelectionPrompt(),
                action: 'date_in_past'
              };
            }
            return {
              reply: `⚠️ *Advance Booking Limit:* Self-booking via WhatsApp is available for the next 10 days (up to ${WhatsAppFormatter.formatDate(windowCheck.maxDateStr)}).\n\n` +
                `📞 *Need to book for next month or after 15 days?*\n` +
                `Please contact our Venue Administration directly at *+91 95791 58374* for advance reservations.\n\n` +
                this.getDateSelectionPrompt(),
              action: 'date_exceeds_10_days'
            };
          }

          dialogSessions.set(phone, {
            step: 'awaiting_sport_choice',
            date: directParsedDate,
            updatedAt: Date.now()
          });
          return {
            reply: this.getSportSelectionPrompt(directParsedDate),
            action: 'select_sport_prompt',
            date: directParsedDate
          };
        }

        return {
          reply: `⚠️ Please choose a valid option:\n\n` + this.getDateSelectionPrompt(),
          action: 'invalid_date_choice'
        };
      }

      // Step B: User is typing a Custom Date (must be in next 10 days)
      if (session.step === 'awaiting_custom_date') {
        const parsedDate = this.parseDate(text, true);

        if (!parsedDate) {
          const tomorrowStr = getVenueDateString(1);
          return {
            reply: `⚠️ Could not understand that date format.\n` +
              `👉 Please reply with a date within the next 10 days (e.g. *${WhatsAppFormatter.formatDate(tomorrowStr)}*, *15/11/2026*, or *Friday*):`,
            action: 'custom_date_unrecognized'
          };
        }

        const windowCheck = this.validate10DayWindow(parsedDate);
        if (!windowCheck.valid) {
          if (windowCheck.reason === 'past') {
            return {
              reply: `⚠️ That date has already passed. Please select a date between today and ${WhatsAppFormatter.formatDate(windowCheck.maxDateStr)}:`,
              action: 'custom_date_past'
            };
          }
          return {
            reply: `⚠️ *Advance Booking Limit:* Self-booking via WhatsApp is available for the next 10 days (up to ${WhatsAppFormatter.formatDate(windowCheck.maxDateStr)}).\n\n` +
              `📞 *Need to book for next month or after 15 days?*\n` +
              `Please contact our Venue Administration directly at *+91 95791 58374* for advance reservations.\n\n` +
              `👉 Or enter a date within the next 10 days:`,
            action: 'custom_date_exceeds_10_days'
          };
        }

        dialogSessions.set(phone, {
          step: 'awaiting_sport_choice',
          date: parsedDate,
          updatedAt: Date.now()
        });
        return {
          reply: this.getSportSelectionPrompt(parsedDate),
          action: 'select_sport_prompt',
          date: parsedDate
        };
      }

      // Step B.2: User is picking Sport for the chosen Date
      if (session.step === 'awaiting_sport_choice') {
        // Option to change date
        if (lower === 'change date' || lower === 'date' || lower === 'other date' || lower === 'back' || lower === 'select date') {
          dialogSessions.set(phone, { step: 'awaiting_date_choice', updatedAt: Date.now() });
          return {
            reply: this.getDateSelectionPrompt(),
            action: 'book_turf_date_prompt'
          };
        }

        // Direct date attempt while in sport selection (e.g. user changes mind and types "tomorrow" or "Friday")
        const parsedDateAttempt = this.parseDate(text, true);
        const isSportKeyword = this.resolveSportFromInput(text);
        if (parsedDateAttempt && !isSportKeyword) {
          const windowCheck = this.validate10DayWindow(parsedDateAttempt);
          if (windowCheck.valid) {
            session.date = parsedDateAttempt;
            session.updatedAt = Date.now();
            dialogSessions.set(phone, session);
            return {
              reply: `📅 Date updated to *${WhatsAppFormatter.formatDate(parsedDateAttempt)}*.\n\n` +
                this.getSportSelectionPrompt(parsedDateAttempt),
              action: 'select_sport_prompt',
              date: parsedDateAttempt
            };
          }
        }

        const selectedSport = this.resolveSportFromInput(text);
        if (!selectedSport) {
          return {
            reply: `⚠️ Please choose a valid sport for ${WhatsAppFormatter.formatDate(session.date)}:\n\n` +
              this.getSportSelectionPrompt(session.date),
            action: 'invalid_sport_choice'
          };
        }

        // Fetch slots ONLY for this selected sport
        const availData = SlotEngine.getAvailableSlots(selectedSport.id, session.date, phone);
        const exampleCourt = availData.courts[0]?.court_name?.split(/[—–\-]/)[0].trim() || 'Court';
        const slotsFormatted = WhatsAppFormatter.formatAvailableSlots(availData);
        const totalAvail = availData.courts.reduce((sum, c) => sum + c.slots.length, 0);

        if (totalAvail > 0) {
          dialogSessions.set(phone, {
            step: 'awaiting_slot_selection',
            date: session.date,
            sportId: selectedSport.id,
            sportName: selectedSport.name,
            updatedAt: Date.now()
          });
        } else {
          // Keep in awaiting_sport_choice so customer can pick another sport or change date
          dialogSessions.set(phone, {
            step: 'awaiting_sport_choice',
            date: session.date,
            updatedAt: Date.now()
          });
        }

        const sportIcon = selectedSport.icon ? `${selectedSport.icon} ` : '';
        return {
          reply: `🏟️ *Available Slots for ${sportIcon}${selectedSport.name} (${WhatsAppFormatter.formatDate(session.date)}):*\n\n` +
            slotsFormatted + `\n\n` +
            (totalAvail > 0
              ? `👉 *To reserve:* Reply with your court and time (e.g. *"${exampleCourt} at 7pm"* or *"8pm"*).\n_(Or reply *sport* to choose another sport, or *date* to pick another date)_`
              : `👉 _No open slots found for ${selectedSport.name} on this date. Reply *sport* to choose another sport, or *date* to pick another date._`),
          action: 'slots_for_sport',
          date: session.date,
          sport: selectedSport
        };
      }
      // Step C: User is picking Slot/Time for the chosen date and sport
      if (session.step === 'awaiting_slot_selection') {
        // INTERCEPT NAVIGATION & MENU NUMBERS FIRST:
        // Option to Change Sport
        if (lower === 'sport' || lower === 'sports' || lower === 'change sport' || lower === 'select sport' || lower === 'other sport') {
          dialogSessions.set(phone, {
            step: 'awaiting_sport_choice',
            date: session.date,
            updatedAt: Date.now()
          });
          return {
            reply: this.getSportSelectionPrompt(session.date),
            action: 'select_sport_prompt',
            date: session.date
          };
        }

        // Option 1: User wants to pick another date / book turf
        if (lower === '1' || lower === 'book turf' || lower === 'change date' || lower === 'select date' || lower === 'other date' || lower === 'date') {
          dialogSessions.set(phone, { step: 'awaiting_date_choice', updatedAt: Date.now() });
          return {
            reply: this.getDateSelectionPrompt(),
            action: 'book_turf_date_prompt'
          };
        }

        // Option 2: User wants to see available slots for today
        if (lower === '2' || lower === 'today' || lower === 'slots today' || lower.includes('available slots for today')) {
          const todayStr = getVenueDateString(0);
          dialogSessions.set(phone, { step: 'awaiting_sport_choice', date: todayStr, updatedAt: Date.now() });
          return {
            reply: this.getSportSelectionPrompt(todayStr),
            action: 'select_sport_prompt',
            date: todayStr
          };
        }

        // Option 3: User wants to check my bookings
        if (lower === '3' || lower.includes('my booking') || lower.includes('my bookings') || lower.includes('show my bookings')) {
          dialogSessions.delete(phone);
          const bookings = BookingService.lookupBookings({ phone, onlyPending: true });
          return {
            reply: WhatsAppFormatter.formatCustomerBookings(bookings),
            action: 'lookup_bookings',
            data: bookings
          };
        }

        // Date switches while in slot selection
        if (lower === 'tomorrow' || lower === 'kal') {
          const tomorrowStr = getVenueDateString(1);
          dialogSessions.set(phone, { step: 'awaiting_sport_choice', date: tomorrowStr, updatedAt: Date.now() });
          return {
            reply: this.getSportSelectionPrompt(tomorrowStr),
            action: 'select_sport_prompt',
            date: tomorrowStr
          };
        }

        const parsedTime = this.parseTime(text);
        if (!parsedTime) {
          const sportLabel = session.sportName ? ` for *${session.sportName}*` : '';
          return {
            reply: `⏰ What time would you like to play${sportLabel} on *${WhatsAppFormatter.formatDate(session.date)}*?\n\n` +
              `👉 Example: *"Turf A at 7:00 PM"*, *"8pm"*, or *"7 baje"*.\n\n` +
              `_(Or reply *sport* to choose another sport, *date* to change date, or *menu* to start over)_`,
            action: 'need_time_for_slot'
          };
        }

        // Identify court - restrict to candidate courts supporting selected sport if known
        const courts = store.getCourts().filter(c => c.status === 'active');
        const sportCourts = session.sportId
          ? courts.filter(c => c.sport_ids && c.sport_ids.includes(session.sportId))
          : courts;
        const candidateCourts = sportCourts.length > 0 ? sportCourts : courts;

        const explicitlySpecified = this.resolveCourt(text, candidateCourts, false);
        let court = explicitlySpecified;
        if (!court && session.courtId) {
          court = candidateCourts.find(c => c.id === session.courtId);
        }
        if (!court) {
          court = this.resolveCourt(text, candidateCourts, true);
        }

        let sportId = session.sportId || court.sport_ids?.[0] || 'sp-football';
        if (!session.sportId && court.sport_ids && court.sport_ids.length > 1) {
          const sports = store.getSports();
          for (const sId of court.sport_ids) {
            const sportObj = sports.find(s => s.id === sId);
            if (sportObj && lower.includes(sportObj.name.toLowerCase())) {
              sportId = sId;
              break;
            }
          }
        }

        const bookingRes = BookingService.initiateBooking({
          courtId: court.id,
          sportId: sportId,
          date: session.date,
          startTime: parsedTime,
          customerName: name,
          customerPhone: phone
        });

        if (!bookingRes.success) {
          const freshAvail = SlotEngine.getAvailableSlots(sportId, session.date, phone);
          const courtData = freshAvail.courts?.find(c => c.court_id === court.id || c.id === court.id);
          const openSlots = courtData?.slots?.filter(s => s.status === 'available') || [];
          const timesText = openSlots.slice(0, 4).map(s => `• \`${WhatsAppFormatter.formatTime(s.start_time)}\` to \`${WhatsAppFormatter.formatTime(s.end_time)}\` (₹${s.price})`).join('\n');
          const sportLabel = WhatsAppFormatter.getCourtSportsLabel(court);

          return {
            reply: `⚠️ *Slot Unavailable:*\n${bookingRes.message}\n\n` +
              (timesText ? `🏟️ *Remaining open timings on ${court.name}${sportLabel ? ` (${sportLabel})` : ''} for ${WhatsAppFormatter.formatDate(session.date)}:*\n${timesText}\n\n` : '') +
              `👉 Reply with any of the available times above, reply *sport* to choose another sport, or reply *date* to pick another date! ⚽`,
            action: 'booking_conflict'
          };
        }

        // Clear session on successful booking initiation
        dialogSessions.delete(phone);

        return {
          reply: WhatsAppFormatter.formatPaymentCheckout({
            booking: bookingRes.booking,
            payment: bookingRes.payment
          }),
          action: 'booking_initiated',
          data: bookingRes
        };
      }
    }
    // 3. ROOT MENU OPTIONS
    // OPTION 1: BOOK TURF -> Asks for Date (1. Today, 2. Tomorrow, 3. Any other date)
    if (lower === '1' || lower === 'book turf' || lower === 'book a turf' || lower === 'book court' || lower === 'book a court') {
      dialogSessions.set(phone, { step: 'awaiting_date_choice', updatedAt: Date.now() });
      return {
        reply: this.getDateSelectionPrompt(),
        action: 'book_turf_date_prompt'
      };
    }

    // OPTION 2: SHOW AVAILABLE SLOTS FOR TODAY -> Prompts for sport
    if (lower === '2' || lower.includes('available slots for today') || lower === 'show available slots for today' || lower === 'slots today' || lower === 'today slots') {
      const todayStr = getVenueDateString(0);
      dialogSessions.set(phone, {
        step: 'awaiting_sport_choice',
        date: todayStr,
        updatedAt: Date.now()
      });
      return {
        reply: this.getSportSelectionPrompt(todayStr),
        action: 'select_sport_prompt',
        date: todayStr
      };
    }

    // NATURAL LANGUAGE AVAILABILITY CHECK (e.g. "show football slots for tomorrow", "slots for tomorrow", "available slots")
    if ((lower.includes('slot') || lower.includes('available') || lower.includes('availability') || lower.includes('timing') || lower.includes('free')) && !lower.includes('my booking')) {
      const parsedDate = this.parseDate(text);
      const sports = store.getSports();
      let sport = null;
      if (lower.includes('football') || lower.includes('soccer')) {
        sport = sports.find(s => s.name.toLowerCase().includes('football'));
      } else if (lower.includes('cricket')) {
        sport = sports.find(s => s.name.toLowerCase().includes('cricket'));
      } else if (lower.includes('badminton')) {
        sport = sports.find(s => s.name.toLowerCase().includes('badminton'));
      } else if (lower.includes('pickleball') || lower.includes('pickle')) {
        sport = sports.find(s => s.name.toLowerCase().includes('pickleball'));
      }

      // If user specified sport in natural language (e.g. "football slots for tomorrow"):
      if (sport) {
        const availData = SlotEngine.getAvailableSlots(sport.id, parsedDate, phone);
        const courts = store.getCourts().filter(c => c.status === 'active');
        const requestedCourt = this.resolveCourt(text, courts, false);
        if (requestedCourt) {
          availData.courts = availData.courts.filter(c => c.court_id === requestedCourt.id || c.id === requestedCourt.id);
        }
        const slotsFormatted = WhatsAppFormatter.formatAvailableSlots(availData);
        const totalAvail = availData.courts.reduce((sum, c) => sum + c.slots.length, 0);

        if (totalAvail > 0) {
          dialogSessions.set(phone, {
            step: 'awaiting_slot_selection',
            date: parsedDate,
            sportId: sport.id,
            sportName: sport.name,
            courtId: requestedCourt?.id,
            updatedAt: Date.now()
          });
        } else {
          dialogSessions.set(phone, { step: 'awaiting_sport_choice', date: parsedDate, updatedAt: Date.now() });
        }

        return {
          reply: `🏟️ *Available Slots for ${sport.icon ? sport.icon + ' ' : ''}${sport.name} on ${WhatsAppFormatter.formatDate(parsedDate)}:*\n\n` +
            slotsFormatted + `\n\n` +
            (totalAvail > 0
              ? `👉 *To reserve:* Reply with your court and time (e.g. *"Turf A at 7pm"* or *"Court 1 at 7:00 PM"*).\n_(Or reply *sport* to choose another sport, or *date* to pick another date)_`
              : `👉 No open slots found for ${sport.name} on this date. Reply *sport* to choose another sport, or *date* to pick another date.`),
          action: 'check_availability',
          data: availData
        };
      }

      // No sport was specified -> Prompt user to select sport for the chosen date!
      dialogSessions.set(phone, {
        step: 'awaiting_sport_choice',
        date: parsedDate,
        updatedAt: Date.now()
      });
      return {
        reply: this.getSportSelectionPrompt(parsedDate),
        action: 'select_sport_prompt',
        date: parsedDate
      };
    }
    // OPTION 3: SHOW MY BOOKINGS
    if (lower === '3' || lower.includes('my booking') || lower.includes('my bookings') || lower.includes('show my bookings') || lower.includes('check booking')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      const bookings = BookingService.lookupBookings({
        phone,
        ref: matchRef ? matchRef[0] : null,
        onlyPending: true
      });

      return {
        reply: WhatsAppFormatter.formatCustomerBookings(bookings),
        action: 'lookup_bookings',
        data: bookings
      };
    }

    // 4. DIRECT BOOKING SHORTCUT (e.g. "Book Turf A tomorrow at 8pm", "Reserve Turf B today at 6pm", "Turf A at 7pm")
    const activeCourts = store.getCourts().filter(c => c.status === 'active');
    const hasCourtMention = activeCourts.some(c => {
      const baseName = c.name.split(/[—–\-]/)[0].trim().toLowerCase();
      return baseName.length >= 3 && lower.includes(baseName);
    });
    const hasBookingIntent = lower.includes('book') || lower.includes('reserve') || lower.includes('block') ||
      /\b(turf\s*[ab12]|pitch\s*[ab12]|court\s*\d|badminton|cricket|pickleball|football)\b/i.test(lower) ||
      hasCourtMention;
    if (hasBookingIntent) {
      const parsedTime = this.parseTime(text);
      if (parsedTime) {
        const parsedDate = this.parseDate(text);
        const windowCheck = this.validate10DayWindow(parsedDate);
        if (!windowCheck.valid) {
          return {
            reply: `⚠️ *Advance Booking Limit:* Self-booking via WhatsApp is available for the next 10 days (up to ${WhatsAppFormatter.formatDate(windowCheck.maxDateStr)}).\n\n` +
              `📞 *Need to book for next month or after 15 days?*\n` +
              `Please contact our Venue Administration directly at *+91 95791 58374* for advance reservations.\n\n` +
              this.getDateSelectionPrompt(),
            action: 'direct_booking_limit_exceeded'
          };
        }

        const court = this.resolveCourt(text, activeCourts, true);

        let sportId = court.sport_ids?.[0] || 'sp-football';
        if (court.sport_ids && court.sport_ids.length > 1) {
          const sports = store.getSports();
          for (const sId of court.sport_ids) {
            const sportObj = sports.find(s => s.id === sId);
            if (sportObj && lower.includes(sportObj.name.toLowerCase())) {
              sportId = sId;
              break;
            }
          }
        }

        const bookingRes = BookingService.initiateBooking({
          courtId: court.id,
          sportId: sportId,
          date: parsedDate,
          startTime: parsedTime,
          customerName: name,
          customerPhone: phone
        });

        if (!bookingRes.success) {
          const freshAvail = SlotEngine.getAvailableSlots(sportId, parsedDate, phone);
          const courtData = freshAvail.courts?.find(c => c.court_id === court.id || c.id === court.id);
          const openCourtSlots = courtData?.slots?.filter(s => s.status === 'available') || [];
          const timesText = openCourtSlots.slice(0, 4).map(s => `• \`${WhatsAppFormatter.formatTime(s.start_time)}\` to \`${WhatsAppFormatter.formatTime(s.end_time)}\` (₹${s.price})`).join('\n');
          const sportLabel = WhatsAppFormatter.getCourtSportsLabel(court);

          return {
            reply: `⚠️ *Slot Unavailable:*\n${bookingRes.message}\n\n` +
              (timesText ? `🏟️ *Remaining open timings on ${court.name}${sportLabel ? ` (${sportLabel})` : ''} for ${WhatsAppFormatter.formatDate(parsedDate)}:*\n${timesText}\n\n` : '') +
              `👉 Reply with any of the available times above, or reply *1* to pick another date! ⚽`,
            action: 'booking_conflict'
          };
        }

        dialogSessions.delete(phone);

        return {
          reply: WhatsAppFormatter.formatPaymentCheckout({
            booking: bookingRes.booking,
            payment: bookingRes.payment
          }),
          action: 'booking_initiated',
          data: bookingRes
        };
      }

      // If user typed a court name but did not specify time (e.g. "book turf A", "book for turf A", "reserve turf B")
      const explicitlySpecified = this.resolveCourt(text, activeCourts, false);
      if (explicitlySpecified) {
        const parsedDate = this.parseDate(text, true) || getVenueDateString(0);
        dialogSessions.set(phone, {
          step: 'awaiting_slot_selection',
          courtId: explicitlySpecified.id,
          date: parsedDate,
          updatedAt: Date.now()
        });

        const availData = SlotEngine.getAvailableSlots(explicitlySpecified.sport_ids?.[0], parsedDate, phone);
        const courtData = availData.courts?.find(c => c.court_id === explicitlySpecified.id || c.id === explicitlySpecified.id);
        const openSlots = courtData?.slots?.filter(s => s.status === 'available') || [];
        const timesText = openSlots.slice(0, 5).map(s => `• \`${WhatsAppFormatter.formatTime(s.start_time)}\` to \`${WhatsAppFormatter.formatTime(s.end_time)}\` (₹${s.price})`).join('\n');
        const sportLabel = WhatsAppFormatter.getCourtSportsLabel(explicitlySpecified);

        return {
          reply: `🏟️ *${explicitlySpecified.name}*${sportLabel ? ` (${sportLabel})` : ''}\n` +
            `📅 *Date:* ${WhatsAppFormatter.formatDate(parsedDate)}\n\n` +
            (timesText
              ? `⚡ *Available timings:*\n${timesText}\n\n👉 *To reserve:* Reply with your desired time (e.g. *"7:00 PM"* or *"8pm"*).`
              : `⚠️ No slots open for this date. Reply *1* to choose another date!`),
          action: 'court_selected_need_time',
          courtId: explicitlySpecified.id,
          date: parsedDate
        };
      }
    }

    // 5. VENUE INFORMATION, PRICING, DIRECTIONS & RULES
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

    // 6. CANCEL BOOKING (Mandatory Two-Step Guardrail)
    if (lower.includes('cancel')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      let booking = null;
      let bookingRef = null;

      if (matchRef) {
        bookingRef = matchRef[0].toUpperCase();
        booking = store.getBookings().find(b => b.booking_ref === bookingRef);
      } else {
        // Allow matching by 4-digit Gate Pass OTP or auto-resolving single active confirmed booking
        const cleanDigits = phone ? phone.replace(/\D/g, '').slice(-10) : '';
        const matchOtp = text.match(/\b\d{4}\b/);
        const userConfirmed = store.getBookings().filter(b => 
          (b.customer_phone?.replace(/\D/g, '').slice(-10) === cleanDigits) &&
          b.status === 'confirmed'
        );

        if (matchOtp) {
          booking = userConfirmed.find(b => 
            (b.booking_ref && b.booking_ref.endsWith(matchOtp[0])) ||
            b.gate_pass_otp === matchOtp[0] ||
            WhatsAppFormatter.getBookingGatePassOtp(b) === matchOtp[0]
          );
        } else if (userConfirmed.length === 1) {
          booking = userConfirmed[0];
        }

        if (booking) {
          bookingRef = booking.booking_ref;
        }
      }

      if (!booking || !bookingRef) {
        return {
          reply: `⚠️ Please provide your 4-digit Gate Pass OTP or Booking Reference to cancel (e.g., *"Cancel 5231"*).\n\n` +
            `Type *"3"* or *"My bookings"* if you need to review your active reservations.`,
          action: 'cancel_need_ref'
        };
      }

      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        return {
          reply: `ℹ️ Booking *${bookingRef}* is already cancelled (Refund recorded: ₹${booking.refund_amount || 0}).`,
          action: 'cancel_already_done'
        };
      }

      const isExplicitConfirmation = lower.includes('confirm cancel') || lower.includes('yes cancel') || lower.includes('confirm cancellation');

      if (!isExplicitConfirmation) {
        const refundCalc = BookingService.calculateRefund(booking);
        return {
          reply: `⚠️ *Cancellation Policy & Refund Terms:*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎟️ *Booking Ref:* \`${bookingRef}\`\n` +
            `🏟️ *Court:* ${booking.court_name}\n` +
            `📅 *Match Date:* ${WhatsAppFormatter.formatDate(booking.booking_date)} (${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)})\n` +
            `💰 *Original Paid:* ₹${booking.total_amount}\n` +
            `💸 *Refund Amount:* *₹${refundCalc.refundAmount}* (${refundCalc.refundPct}% tier, ${refundCalc.hoursRemaining} hrs notice)\n` +
            `⏱️ *Processing Timeline:* 5-7 business days\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Are you sure you want to cancel? To proceed with cancellation, please reply:\n` +
            `👉 *"CONFIRM CANCEL ${bookingRef}"*`,
          action: 'cancel_confirmation_prompt',
          data: { bookingRef, refundCalc }
        };
      }

      const cancelRes = BookingService.cancelBooking(bookingRef, phone);
      return {
        reply: cancelRes.message,
        action: 'cancel_booking',
        success: cancelRes.success,
        data: cancelRes
      };
    }

    // 7. RESCHEDULE BOOKING
    if (lower.includes('reschedule') || lower.includes('postpone') || lower.includes('change time')) {
      const matchRef = text.match(/TRF-\d{8}-\d{4}/i);
      const matchOtp = text.match(/\b\d{4}\b/);
      const parsedTime = this.parseTime(text);
      const parsedDate = this.parseDate(text);
      let bookingRef = matchRef ? matchRef[0].toUpperCase() : null;

      if (!bookingRef) {
        const cleanDigits = phone ? phone.replace(/\D/g, '').slice(-10) : '';
        const userConfirmed = store.getBookings().filter(b => 
          (b.customer_phone?.replace(/\D/g, '').slice(-10) === cleanDigits) &&
          b.status === 'confirmed'
        );
        if (matchOtp) {
          const matched = userConfirmed.find(b => 
            (b.booking_ref && b.booking_ref.endsWith(matchOtp[0])) ||
            b.gate_pass_otp === matchOtp[0] ||
            WhatsAppFormatter.getBookingGatePassOtp(b) === matchOtp[0]
          );
          if (matched) bookingRef = matched.booking_ref;
        } else if (userConfirmed.length === 1) {
          bookingRef = userConfirmed[0].booking_ref;
        }
      }

      if (!bookingRef || !parsedTime) {
        return {
          reply: `🔄 *Reschedule Booking*\n` +
            `Please specify your 4-digit Gate OTP, new date, and new time.\n\n` +
            `*Example:* *"Reschedule 5231 to tomorrow at 8:00 PM"*`,
          action: 'reschedule_need_details'
        };
      }

      const reschedRes = BookingService.rescheduleBooking(bookingRef, parsedDate, parsedTime);
      return {
        reply: reschedRes.message,
        action: 'reschedule_booking',
        success: reschedRes.success,
        data: reschedRes
      };
    }

    // Default Fallback: Show Main Menu
    return {
      reply: this.getMainMenuText(name),
      action: 'menu_fallback'
    };
  }
}
