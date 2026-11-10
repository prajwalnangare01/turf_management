import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronRight, Zap } from 'lucide-react';
import { formatDateReadable } from '../../utils/formatters';

export interface HoldSummaryBarProps {
  /** Number of slots currently held */
  heldCount: number;
  /** Formatted start time, e.g. "06:00 PM" */
  startTime?: string;
  /** Formatted end time, e.g. "07:00 PM" */
  endTime?: string;
  /** Combined fallback interval, e.g. "06:00 PM – 07:00 PM" */
  timeRange?: string;
  /** Date string (YYYY-MM-DD or DD/MM/YYYY) */
  date: string;
  /** Grand total amount in INR */
  totalPrice: number;
  /** Optional epoch timestamp (ms) when slot hold expires */
  expiresAt?: number;
  /** Currency symbol, defaults to '₹' */
  currencySymbol?: string;
  /** Tax subtext, defaults to '(incl. taxes)' */
  taxText?: string;
  /** Optional pitch/court title */
  courtName?: string;
  /** Button label */
  proceedText?: string;
  /** Loading or busy state */
  isLoading?: boolean;
  /** Click callback for the Proceed CTA */
  onProceed: () => void;
  /** Optional custom class overrides */
  className?: string;
}

export const HoldSummaryBar: React.FC<HoldSummaryBarProps> = ({
  heldCount,
  startTime: propStartTime,
  endTime: propEndTime,
  timeRange,
  date,
  totalPrice,
  expiresAt,
  currencySymbol = '₹',
  taxText = '(incl. taxes)',
  courtName,
  proceedText = 'PROCEED',
  isLoading = false,
  onProceed,
  className = ''
}) => {
  // 1. Resolve start & end times cleanly
  let startTime = propStartTime;
  let endTime = propEndTime;
  if ((!startTime || !endTime) && timeRange) {
    const parts = timeRange.split(/–|-/);
    startTime = parts[0]?.trim() || '06:00 PM';
    endTime = parts[1]?.trim() || '07:00 PM';
  }
  startTime = startTime || '06:00 PM';
  endTime = endTime || '07:00 PM';

  // 2. Format human-readable date (e.g. "10 Nov 2026")
  const readableDate = formatDateReadable(date, false);
  const readableDateCompact = readableDate.replace(/ \d{4}$/, '');

  // Compact mobile timing (e.g. "06:00 - 07:00 PM" instead of "06:00 PM – 07:00 PM")
  const compactTimeRange = (startTime && endTime)
    ? (startTime.endsWith(' PM') && endTime.endsWith(' PM'))
      ? `${startTime.replace(' PM', '')} - ${endTime}`
      : (startTime.endsWith(' AM') && endTime.endsWith(' AM'))
        ? `${startTime.replace(' AM', '')} - ${endTime}`
        : `${startTime} - ${endTime}`
    : `${startTime} – ${endTime}`;

  // 3. Pluralization: "1 Slot Held" vs "2 Slots Held" (no "Slot(s)")
  const slotCountLabel = heldCount === 1 ? '1 Slot Held' : `${heldCount} Slots Held`;

  // 4. Live Countdown Timer (if expiresAt provided or active hold)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!expiresAt) return null;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) {
      setSecondsRemaining(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formattedTimer = secondsRemaining !== null && secondsRemaining > 0
    ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`
    : null;

  return (
    <footer
      role="region"
      aria-label="Booking summary and checkout actions"
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] z-50 animate-modalScaleIn ${className}`}
    >
      {/* Mobile Top Urgency / Slot Hold Ribbon */}
      <div className="bg-amber-50/95 border-b border-amber-200/50 px-3.5 py-1 sm:hidden flex items-center justify-between text-[11px] font-semibold text-amber-900 select-none">
        <span className="flex items-center gap-1.5 truncate pr-2">
          <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500 shrink-0" />
          <span className="font-bold">{slotCountLabel}</span>
          {courtName && (
            <span className="text-amber-800/80 font-normal truncate max-w-[140px]">
              • {courtName}
            </span>
          )}
        </span>
        {formattedTimer && (
          <span className="font-mono text-[10px] font-bold bg-amber-200/60 text-amber-950 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5 shadow-2xs">
            <span>⚡</span>
            <span>{formattedTimer}</span>
          </span>
        )}
      </div>

      <div className="max-w-[1200px] mx-auto w-full px-3.5 py-2.5 sm:px-6 sm:py-3.5 md:px-8 md:py-4 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left Section: Responsive Layout */}
        <div className="min-w-0 flex flex-col justify-center text-left">
          
          {/* Top Metadata Row: Badge + Court Name (Desktop/Tablet) */}
          <div className="hidden sm:flex items-center gap-2 mb-1">
            <span className="bg-amber-50/90 text-amber-800 border border-amber-200/60 font-semibold text-[9.5px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs tracking-wide">
              <Zap className="w-2 h-2 text-amber-600 fill-amber-500 shrink-0" />
              <span>{slotCountLabel}</span>
              {formattedTimer && (
                <span className="font-mono font-bold text-amber-900">• {formattedTimer}</span>
              )}
            </span>

            {courtName && (
              <span className="text-xs text-gray-400 font-medium truncate max-w-[200px]">
                • {courtName}
              </span>
            )}
          </div>

          {/* Mobile Top Row: Large Emerald Price + (incl. taxes) in a clean non-wrapping line */}
          <div className="flex sm:hidden items-baseline gap-1.5 leading-none mb-1.5 whitespace-nowrap">
            <span className="text-xl font-extrabold text-emerald-600 tracking-tight leading-none">
              {currencySymbol}{totalPrice.toLocaleString('en-IN')}
            </span>
            {taxText && (
              <span className="text-[10.5px] text-gray-400 font-normal leading-none select-none whitespace-nowrap">
                {taxText}
              </span>
            )}
          </div>

          {/* Slot Timings & Date Row: Mobile Bottom Row / Desktop Middle Row */}
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-800 sm:mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
            {/* Clock icon once for the time interval */}
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="tracking-tight whitespace-nowrap hidden sm:inline">{startTime} – {endTime}</span>
              <span className="tracking-tight whitespace-nowrap sm:hidden text-[11px] font-semibold">{compactTimeRange}</span>
            </span>

            {/* Soft Dot Separator */}
            <span className="text-gray-300 font-normal select-none" aria-hidden="true">•</span>

            {/* Calendar icon for the readable date */}
            <span className="flex items-center gap-1 shrink-0 text-gray-700">
              <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0 hidden sm:inline-block" />
              <span className="font-semibold text-gray-600 sm:text-gray-800">
                <span className="sm:hidden text-[11px]">{readableDateCompact}</span>
                <span className="hidden sm:inline">{readableDate}</span>
              </span>
            </span>
          </div>

          {/* Desktop/Tablet Bottom Row: Large Emerald Price + Unboxed (incl. taxes) Subtext */}
          <div className="hidden sm:flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-600 tracking-tight leading-none">
              {currencySymbol}{totalPrice.toLocaleString('en-IN')}
            </span>
            {taxText && (
              <span className="text-xs text-gray-400 font-medium leading-none select-none whitespace-nowrap">
                {taxText}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Compact & Vibrant Orange CTA Button */}
        <button
          type="button"
          onClick={onProceed}
          disabled={isLoading}
          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs sm:text-sm px-3.5 py-2.5 sm:px-7 sm:py-3 rounded-full shadow-md shadow-orange-500/20 hover:shadow-lg transition-all transform active:scale-95 sm:hover:-translate-y-0.5 duration-150 flex items-center gap-1.5 shrink-0 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{isLoading ? 'PROCESSING...' : proceedText}</span>
          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </footer>
  );
};

/**
 * Standalone interactive demo of the polished Hold Summary Bar
 */
export const HoldSummaryBarDemo: React.FC = () => {
  return (
    <div className="relative w-full min-h-[140px] bg-slate-100 p-4">
      <HoldSummaryBar
        heldCount={1}
        startTime="06:00 PM"
        endTime="07:00 PM"
        date="2026-11-10"
        totalPrice={1500}
        expiresAt={Date.now() + 299 * 1000}
        courtName="Turf A — FIFA 5-a-side Synthetic"
        onProceed={() => alert('Proceed to checkout clicked!')}
      />
    </div>
  );
};
