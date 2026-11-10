import React from 'react';
import { Sun, Moon, Tag, Clock, Check, Lock, Zap } from 'lucide-react';
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
  const isHeld = slot.status === 'locked' && !isSelected;
  const isBooked = slot.status === 'booked_online' || slot.status === 'booked_offline';
  const isBlocked = slot.status === 'blocked';
  const isPast = slot.status === 'past';
  // Allow clicking on available, held by current, OR held by others (to view hold status & timer modal)
  const isInteractive = isAvailable || isHeldByCurrent || isHeld;
  const isDisabled = isBooked || isBlocked || isPast;

  // Dynamic interactive container state classes matching design specifications:
  // - Default Available: bg-white border-gray-200 hover:border-emerald-400 hover:shadow-md cursor-pointer
  // - Selected: bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm cursor-pointer
  // - Held by other customer: Distinct warm amber gradient with dashed border, active feel, fully clickable
  // - Booked / Past / Blocked (Disabled): bg-gray-50/70 border-gray-200 opacity-60 cursor-not-allowed
  let stateClasses = 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-md cursor-pointer';
  if (isSelected) {
    stateClasses = 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm cursor-pointer';
  } else if (isHeld) {
    stateClasses = 'bg-gradient-to-b from-amber-50/95 via-amber-50/60 to-white border-2 border-dashed border-amber-400/90 hover:border-amber-500 hover:shadow-md cursor-pointer shadow-2xs';
  } else if (isDisabled) {
    stateClasses = 'bg-gray-50/70 border-gray-200 opacity-60 cursor-not-allowed';
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
      title={isHeld ? 'Temporarily held in checkout by another customer — click to view countdown timer' : undefined}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`group select-none rounded-2xl p-3.5 sm:p-4 transition-all duration-200 border flex flex-col justify-between overflow-hidden relative ${stateClasses} ${className}`}
    >
      {/* 1. Card Header: Left Icon & Top-Right Badges */}
      <div className="flex items-start justify-between w-full gap-1.5 sm:gap-2">
        {/* Left Icon: Lucide Sun in soft squircle for day, Moon in soft indigo for night, Clock for Held */}
        <div
          className={`p-1.5 sm:p-2 rounded-xl shrink-0 flex items-center justify-center ${
            isHeld
              ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300/80 shadow-2xs'
              : isNight
              ? 'bg-indigo-50 text-indigo-500'
              : 'bg-amber-50 text-amber-500'
          }`}
        >
          {isHeld ? (
            <Clock className="w-4 h-4 text-amber-700" />
          ) : isNight ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </div>

        {/* Top-Right Badges: Stacked cleanly */}
        <div className="flex flex-col items-end gap-1 shrink-0 ml-auto">
          {isSelected ? (
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
            </div>
          ) : isHeld ? (
            <span className="bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-[9.5px] sm:text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-2xs whitespace-nowrap animate-pulse">
              <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
              <span>ON HOLD</span>
            </span>
          ) : (
            <>
              {hasDiscount && isAvailable && (
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <Tag className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>{discountPct}% OFF</span>
                </span>
              )}

              {slot.is_peak && isAvailable && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200/60 font-semibold text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <Zap className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>PEAK</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. Middle Section: Slot Time in Bold & Duration Directly Below */}
      <div className="mt-3">
        <div className="text-base font-bold text-gray-900 leading-tight flex items-baseline justify-between">
          <span>{time} <span className="text-sm font-bold text-gray-700">{period}</span></span>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1 font-medium mt-1">
          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
          <span>{duration} mins</span>
          {isHeld && (
            <span className="text-[10px] text-amber-800 font-bold ml-1 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200/60">
              Pending Checkout
            </span>
          )}
        </div>
      </div>

      {/* 3. Bottom Section: Price Alignment (flex items-baseline gap-2) & Distinct Status */}
      <div className="flex items-baseline justify-between w-full pt-3 mt-3 border-t border-gray-100">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`text-lg font-bold leading-none ${
              isHeld
                ? 'text-gray-900'
                : isDisabled
                ? 'text-gray-400'
                : 'text-emerald-600'
            }`}
          >
            ₹{slot.price.toLocaleString('en-IN')}
          </span>
          {hasDiscount && isAvailable && (
            <span className="text-xs line-through text-gray-400 font-medium leading-none">
              ₹{slot.original_price?.toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {/* Distinct Status Indicators */}
        {isHeld && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-full shrink-0 leading-none shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping shrink-0" />
            <span>In Checkout</span>
          </span>
        )}
        {(isBooked || slot.status === 'past') && (
          <span className="text-xs text-gray-400 font-medium shrink-0 leading-none">
            Booked
          </span>
        )}
        {isBlocked && (
          <span className="text-xs text-gray-400 font-medium shrink-0 leading-none">
            Blocked
          </span>
        )}
      </div>
    </div>
  );
};
