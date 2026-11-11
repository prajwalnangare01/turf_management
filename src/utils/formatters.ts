export const formatDateDDMMYYYY = (dateInput: string | Date): string => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const clean = dateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
    const matchDMY = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (matchDMY) {
      return `${matchDMY[1]}/${matchDMY[2]}/${matchDMY[3]}`;
    }
    const matchYMD = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (matchYMD) {
      return `${matchYMD[3]}/${matchYMD[2]}/${matchYMD[1]}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatTime12hPlain = (time24: string): string => {
  if (!time24) return '';
  const clean = time24.trim();
  if (/am|pm/i.test(clean)) return clean;
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (isNaN(h)) return time24;

  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const formattedH = h12 < 10 ? `0${h12}` : `${h12}`;

  return `${formattedH}:${m} ${period}`;
};

export const formatTime12h = (time24: string): string => {
  return formatTime12hPlain(time24);
};

export const formatTimeRange12h = (startTime24: string, endTime24: string): string => {
  if (!startTime24 || !endTime24) return '';
  return `${formatTime12hPlain(startTime24)} – ${formatTime12hPlain(endTime24)}`;
};

export const formatTimeRange12hPlain = (startTime24: string, endTime24: string): string => {
  if (!startTime24 || !endTime24) return '';
  return `${formatTime12hPlain(startTime24)} – ${formatTime12hPlain(endTime24)}`;
};

export const formatDateReadable = (dateInput: string | Date, includeDayOfWeek = false): string => {
  if (!dateInput) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let d: Date;
  if (typeof dateInput === 'string') {
    const clean = dateInput.trim();
    const matchDMY = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (matchDMY) {
      d = new Date(Number(matchDMY[3]), Number(matchDMY[2]) - 1, Number(matchDMY[1]));
    } else {
      const matchYMD = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (matchYMD) {
        d = new Date(Number(matchYMD[1]), Number(matchYMD[2]) - 1, Number(matchYMD[3]));
      } else {
        d = new Date(dateInput);
      }
    }
  } else {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) return String(dateInput);

  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();

  return includeDayOfWeek
    ? `${dayName}, ${dayNum} ${monthName} ${year}`
    : `${dayNum} ${monthName} ${year}`;
};

export const formatPhoneNumber = (phoneInput?: string): string => {
  if (!phoneInput) return '';
  const clean = phoneInput.trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `+91 ${last10}`;
  }
  return clean;
};

/**
 * Universal Gate Pass OTP resolver:
 * Ensures multi-slot sibling bookings (e.g. TRF-20261110-2221 and TRF-20261110-2221-2)
 * always resolve to the exact same clean 4-digit code (e.g. "2221"), NEVER "21-2" or missing a digit.
 */
export const getBookingGatePassOtp = (booking?: {
  gate_pass_otp?: string | null;
  group_ref?: string | null;
  booking_ref?: string | null;
  id?: string | null;
  notes?: string | null;
} | null): string => {
  if (!booking) return '----';

  // 1. If explicit 4-digit OTP exists, return it
  if (booking.gate_pass_otp && /^\d{4}$/.test(String(booking.gate_pass_otp).trim())) {
    return String(booking.gate_pass_otp).trim();
  }

  // 2. Check if OTP is tagged in notes (e.g. "[OTP: 7341]" or "OTP: 7341")
  if (booking.notes) {
    const notesMatch = String(booking.notes).match(/\bOTP[:\s-]+([0-9]{4})\b/i);
    if (notesMatch) {
      return notesMatch[1];
    }
  }

  // 3. Derive directly from group_ref or base booking_ref trailing 4 digits
  const rawRef = (booking.group_ref || booking.booking_ref || booking.id || '').toString().trim();
  if (rawRef) {
    const siblingMatch = rawRef.match(/^(.*-\d{4})-\d+$/);
    const baseRef = siblingMatch ? siblingMatch[1] : rawRef;
    const trailingDigitsMatch = baseRef.match(/\d{4}$/);
    if (trailingDigitsMatch) {
      return trailingDigitsMatch[0];
    }
    const allDigits = baseRef.replace(/\D/g, '');
    if (allDigits.length >= 4) {
      return allDigits.slice(-4);
    }
  }

  return rawRef.slice(-4) || '----';
};

/**
 * Universal booking group reference normalizer:
 * Maps any sibling booking (e.g. TRF-20261110-2221-2) back to its primary parent ref ("TRF-20261110-2221")
 */
export const getBookingGroupRef = (booking?: {
  group_ref?: string | null;
  booking_ref?: string | null;
  id?: string | null;
} | null): string => {
  if (!booking) return '';
  const raw = (booking.group_ref || booking.booking_ref || booking.id || '').toString().trim();
  const siblingMatch = raw.match(/^(.*-\d{4})-\d+$/);
  return siblingMatch ? siblingMatch[1] : raw;
};


