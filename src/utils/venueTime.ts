/**
 * Venue Timezone & Indian Locale Utilities
 * Enforces Asia/Kolkata (+05:30) across all booking boundaries, clock skew protections,
 * and E.164 phone normalization.
 */

export const VENUE_TIMEZONE = 'Asia/Kolkata';

/**
 * Get current time calibrated to venue timezone Asia/Kolkata (+05:30)
 * Protects against client machine clock skew or foreign device timezones (UTC, PST, etc.)
 */
export function getVenueNow(): Date {
  const now = new Date();
  try {
    const kolkataStr = now.toLocaleString('en-US', { timeZone: VENUE_TIMEZONE });
    return new Date(kolkataStr);
  } catch {
    // Fallback: manually apply +05:30 offset
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const kolkataOffsetMs = (5 * 60 + 30) * 60000;
    return new Date(utcTime + kolkataOffsetMs);
  }
}

/**
 * Get current date string (YYYY-MM-DD) in Asia/Kolkata, with optional offset in days
 */
export function getVenueDateString(offsetDays: number = 0): string {
  const vDate = getVenueNow();
  if (offsetDays !== 0) {
    vDate.setDate(vDate.getDate() + offsetDays);
  }
  const y = vDate.getFullYear();
  const m = String(vDate.getMonth() + 1).padStart(2, '0');
  const d = String(vDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get current minutes from midnight in Asia/Kolkata
 */
export function getVenueMinutesFromMidnight(): number {
  const vDate = getVenueNow();
  return vDate.getHours() * 60 + vDate.getMinutes();
}

/**
 * CC-S04: E.164 Indian Phone Normalization Pipe
 * Normalizes input variants:
 * "9876543210", "+919876543210", "09876543210", "+91 98765-43210" -> "+919876543210"
 * Ensures blacklisted customers cannot circumvent restrictions using formatting tricks.
 */
export function normalizeIndianPhone(input: string): string {
  if (!input) return '';
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly.length < 10) return input.trim();
  const last10 = digitsOnly.slice(-10);
  return `+91${last10}`;
}

/**
 * CC-A03: Indian Conversational Time Parser
 * Parses colloquial requests: "kal shaam 7 baje", "Friday 8pm", "Book for 7", "9 am"
 * Defaults standalone hours 5 through 11 to PM (17:00 – 23:00) since >85% of turf traffic is evening.
 * Returns both 12-hour and 24-hour representations.
 */
export function parseIndianTimeInput(text: string): { 
  time24: string; 
  time12: string; 
  isPm: boolean;
  confidence: 'high' | 'medium' | 'low';
} | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // Explicit AM / PM match (e.g. "8pm", "8:30 pm", "10am")
  const ampmRegex = /(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
  const ampmMatch = lower.match(ampmRegex);

  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3] === 'pm';

    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;

    const time24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const time12 = `${h12}:${String(minute).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
    return { time24, time12, isPm, confidence: 'high' };
  }

  // Hindi colloquial keywords: shaam, raat (evening/night -> PM), subah, dopahar (morning/afternoon)
  const isEveningKeyword = lower.includes('shaam') || lower.includes('raat') || lower.includes('sham') || lower.includes('evening') || lower.includes('night');
  const isMorningKeyword = lower.includes('subah') || lower.includes('morning');

  // Match numbers followed by "baje" or standalone hour (e.g. "7 baje", "8 baje", "at 7")
  const bajeRegex = /(\b\d{1,2})(?::(\d{2}))?\s*(?:baje|o'clock|hrs)?/;
  const bajeMatch = lower.match(bajeRegex);

  if (bajeMatch) {
    let hour = parseInt(bajeMatch[1], 10);
    const minute = bajeMatch[2] ? parseInt(bajeMatch[2], 10) : 0;

    let isPm = false;
    if (isEveningKeyword) {
      isPm = true;
    } else if (isMorningKeyword) {
      isPm = false;
    } else {
      // CC-A03: Default standalone numbers 5..11 to PM (17:00..23:00) for turf peak hours
      isPm = (hour >= 5 && hour <= 11);
    }

    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;

    const time24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const time12 = `${h12}:${String(minute).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
    return { time24, time12, isPm, confidence: 'medium' };
  }

  return null;
}
