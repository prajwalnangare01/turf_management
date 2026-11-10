import React from 'react';
import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';

export interface TimeOfDayIconProps {
  time24?: string;
  className?: string;
}

export type TimeOfDayType = 'sunrise' | 'sun' | 'sunset' | 'moon';

export function getTimeOfDayType(time24?: string): TimeOfDayType {
  if (!time24) return 'sun';
  const clean = time24.trim();
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) {
    // Check if 12h format like "06:00 AM" or "08:00 PM"
    const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      h = parseInt(match[1], 10);
      const isPm = match[3] && match[3].toUpperCase() === 'PM';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
    } else {
      return 'sun';
    }
  }

  if (h >= 5 && h < 9) {
    return 'sunrise'; // Early Morning / Sunrise
  } else if (h >= 9 && h < 16) {
    return 'sun'; // Daytime / Sun
  } else if (h >= 16 && h < 19) {
    return 'sunset'; // Late Afternoon / Sunset
  } else {
    return 'moon'; // Evening / Night / Moon
  }
}

/**
 * Modern Lucide React Icon representing time of day (replacing old raw emojis)
 */
export const TimeOfDayIcon: React.FC<TimeOfDayIconProps> = ({ 
  time24, 
  className = 'w-3.5 h-3.5 inline-block align-middle' 
}) => {
  const type = getTimeOfDayType(time24);

  switch (type) {
    case 'sunrise':
      return <Sunrise className={`text-amber-500 shrink-0 ${className}`} aria-label="Sunrise" />;
    case 'sun':
      return <Sun className={`text-amber-500 shrink-0 ${className}`} aria-label="Day" />;
    case 'sunset':
      return <Sunset className={`text-orange-500 shrink-0 ${className}`} aria-label="Sunset" />;
    case 'moon':
    default:
      return <Moon className={`text-indigo-500 shrink-0 ${className}`} aria-label="Night" />;
  }
};

/**
 * Returns crisp inline SVG string for printable PDF Gate Pass & HTML receipts
 */
export function getTimeOfDaySvg(time24?: string): string {
  const type = getTimeOfDayType(time24);

  switch (type) {
    case 'sunrise':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 2v6"/><path d="m4.93 10.93 1.41 1.41"/><path d="M20 18h2"/><path d="M2 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`;
    case 'sun':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    case 'sunset':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M20 18h2"/><path d="M2 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`;
    case 'moon':
    default:
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  }
}
