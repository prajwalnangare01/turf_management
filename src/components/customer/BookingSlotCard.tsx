import React from 'react';
import { Sun, Moon, Tag, Clock, ArrowRight, Check, Lock, Zap } from 'lucide-react';
import { DynamicSlot } from '../../types/schema';

export interface BookingSlotCardProps {
  /** The slot data object */
  slot: DynamicSlot;
  /** Whether this slot is actively selected by the customer */
  isSelected?: boolean;
  /** Callback fired when the customer clicks the slot card */
  onToggle?: (slot: DynamicSlot) => void;
  /** Optional custom class name overrides */
  className?: string;
  /** Custom duration in minutes (defaults to computed diff between end_time and start_time, or 60) */
  durationMinutes?: number;
}

/**
 * Parses "14:00" into 12-hour format parts: "02:00", "PM", and determines if night.
 */
export const parseSlotTime = (time24: string): { time: string; period: string; isNight: boolean } => {
  if (!time24) return { time: '12:00', period: 'PM', isNight: false };
  const clean = time24.trim();
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] ? parts[1].slice(0, 2) : '00';
  if (isNaN(h)) return { time: time24, period: '', isNight: false };

  const period = h >= 12 ? 'PM' : 'AM';
  const isNight = h >= 18 || h < 5;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const formattedH = h12 < 10 ? `0${h12}` : `${h12}`;

  return {
    time: `${formattedH}:${m}`,
    period,
    isNight
  };
};

/**
 * Calculates duration in minutes from "HH:MM" start and end strings.
 */
export const calculateSlotDuration = (startTime: string, endTime: string, fallback = 60): number => {
  if (!startTime || !endTime) return fallback;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return fallback;
  const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  return diff > 0 ? diff : fallback;
};

/**
 * Modern, production-grade Booking Slot Card UI component.
 */
export const BookingSlotCard: React.FC<BookingSlotCardProps> = ({
  slot,
  isSelected = false,
  onToggle,
  className = '',
  durationMinutes
}) => {
  const { time, period, isNight } = parseSlotTime(slot.start_time);
  const duration = durationMinutes ?? calculateSlotDuration(slot.start_time, slot.end_time, 60);

  // Discount calculation
  const hasDiscount = Boolean(slot.original_price && slot.original_price > slot.price);
  const discountPct = hasDiscount && slot.original_price
    ? Math.round(((slot.original_price - slot.price) / slot.original_price) * 100)
    : 0;

  // Status conditions
  const isAvailable = slot.status === 'available';
  const isHeldByCurrent = slot.status === 'locked' && isSelected;
  const isInteractive = isAvailable || isHeldByCurrent;
  const isDisabled = !isInteractive;

  // Dynamic interactive container state classes matching reference design
  let stateClasses = 'bg-white border-gray-200 hover:border-emerald-500 hover:shadow-sm';
  if (isDisabled) {
    stateClasses = 'opacity-50 grayscale cursor-not-allowed border-dashed bg-gray-50/80 border-gray-200';
  } else if (isSelected) {
    stateClasses = 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-sm';
  }

  const handleClick = () => {
    if (isInteractive && onToggle) {
      onToggle(slot);
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={isInteractive ? 0 : -1}
      aria-pressed={isSelected}
      aria-disabled={isDisabled}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`group rounded-2xl p-3 sm:p-3.5 border transition-all duration-200 select-none flex flex-col justify-between overflow-hidden ${
        isInteractive ? 'cursor-pointer' : 'cursor-not-allowed'
      } ${stateClasses} ${className}`}
    >
      {/* 1. Header Row: Time Details (Left) & Stacked Deal Badge (Right) */}
      <div className="flex items-start justify-between gap-1.5 w-full">
        {/* Left: Sun/Moon Icon Box + Stacked Time & Duration */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Squircle Time Icon Box */}
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isNight
                ? 'bg-indigo-50/80 border-indigo-200/60 text-indigo-500'
                : 'bg-amber-50/90 border-amber-200/60 text-amber-500'
            }`}
          >
            {isNight ? (
              <Moon className="w-4 h-4 text-indigo-500 fill-indigo-100/50" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500 fill-amber-100/50" />
            )}
          </div>

          {/* Time & Duration: 02:00 on Line 1, PM on Line 2, 60 mins on Line 3 */}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-gray-900 text-sm sm:text-base leading-none tracking-tight">
              {time}
            </span>
            <span className="font-bold text-gray-900 text-xs sm:text-sm leading-tight mt-0.5">
              {period}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-gray-400 font-medium mt-1 leading-none">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="truncate">{duration} mins</span>
            </div>
          </div>
        </div>

        {/* Right: Stacked Deal Badge Pill (Never overflows) */}
        <div className="shrink-0 flex items-start gap-1">
          {hasDiscount && isAvailable && (
            <div className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-2xl px-2.5 py-1 flex items-center gap-1.5 shadow-2xs">
              <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div className="flex flex-col text-left leading-none">
                <span className="text-[11px] font-bold text-emerald-700 leading-tight">
                  {discountPct}%
                </span>
                <span className="text-[9px] font-extrabold text-emerald-600 tracking-wider uppercase leading-tight">
                  OFF
                </span>
              </div>
            </div>
          )}

          {slot.is_peak && isAvailable && (
            <span className="bg-amber-50 text-amber-800 border border-amber-200/80 font-bold text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5 fill-amber-600 text-amber-600 shrink-0" /> PEAK
            </span>
          )}
        </div>
      </div>

      {/* 2. Subtle Horizontal Hairline Divider */}
      <div className="w-full my-3 border-t border-gray-100" />

      {/* 3. Pricing & Footer Action Section */}
      <div className="flex items-baseline justify-between gap-1.5 w-full">
        {/* Baseline-aligned prices */}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-lg sm:text-xl font-bold text-emerald-600 tracking-tight leading-none">
            ₹{slot.price.toLocaleString('en-IN')}
          </span>
          {hasDiscount && (
            <span className="text-xs line-through text-gray-400 font-medium leading-none">
              ₹{slot.original_price?.toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {/* Footer Right Status / Action */}
        <div className="shrink-0 flex items-center">
          {isSelected ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3 stroke-[3]" /> Selected
            </span>
          ) : isAvailable ? (
            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-emerald-600 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all">
              Book <ArrowRight className="w-3.5 h-3.5" />
            </span>
          ) : slot.status === 'locked' ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
              <Lock className="w-3 h-3" /> Held
            </span>
          ) : (slot.status === 'booked_online' || slot.status === 'booked_offline') ? (
            <span className="text-xs font-medium text-gray-400">
              Passed
            </span>
          ) : slot.status === 'blocked' ? (
            <span className="text-xs font-medium text-gray-400">
              Blocked
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-400">
              Passed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
