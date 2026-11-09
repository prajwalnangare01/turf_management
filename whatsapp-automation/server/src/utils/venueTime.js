// Venue Timezone & Date Normalization Utility (Asia/Kolkata UTC+05:30)
// Guarantees all booking boundaries, operational hours, and availability calendars
// use India Standard Time regardless of the host machine / container timezone.

export const VENUE_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current Date calibrated to Asia/Kolkata timezone
 */
export function getVenueNow() {
  const now = new Date();
  try {
    const kolkataStr = now.toLocaleString('en-US', { timeZone: VENUE_TIMEZONE });
    return new Date(kolkataStr);
  } catch {
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const kolkataOffsetMs = (5 * 60 + 30) * 60000;
    return new Date(utcTime + kolkataOffsetMs);
  }
}

/**
 * Returns current date string (YYYY-MM-DD) in Asia/Kolkata with optional day offset
 * @param {number} offsetDays - 0 for today, 1 for tomorrow, 2 for day after tomorrow, etc.
 */
export function getVenueDateString(offsetDays = 0) {
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
 * Returns current minutes from midnight in Asia/Kolkata (0 to 1439)
 */
export function getVenueMinutesFromMidnight() {
  const vDate = getVenueNow();
  return vDate.getHours() * 60 + vDate.getMinutes();
}
