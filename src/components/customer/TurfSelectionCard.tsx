import React from 'react';
import { Clock, Calendar, Flame, Check } from 'lucide-react';
import { Court } from '../../types/schema';
import { formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';

export interface TurfWeekendRate {
  price: number;
  originalPrice?: number;
}

export interface TurfPeakRate {
  enabled?: boolean;
  startTime: string; // e.g. "06:00 PM"
  endTime: string;   // e.g. "11:00 PM"
  price: number;
  originalPrice?: number;
  discountPercent?: number;
}

export interface TurfSelectionCardProps {
  /** Optional Court model to auto-derive all fields */
  court?: Court;
  /** Active selected date for checking offer validity (YYYY-MM-DD) */
  selectedDate?: string;

  /** Manual overrides / standalone props */
  id?: string;
  title?: string;
  durationMinutes?: number;
  offerText?: string | null;
  openingTime?: string;
  closingTime?: string;
  currentPrice?: number;
  originalPrice?: number;
  discountPercent?: number;
  showPerHour?: boolean;
  weekendRates?: {
    saturday?: TurfWeekendRate;
    sunday?: TurfWeekendRate;
  } | null;
  peakRates?: TurfPeakRate | null;

  /** Selection state & click handler */
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export const TurfSelectionCard: React.FC<TurfSelectionCardProps> = ({
  court,
  selectedDate,
  id,
  title: propTitle,
  durationMinutes: propDuration,
  offerText: propOfferText,
  openingTime: propOpeningTime,
  closingTime: propClosingTime,
  currentPrice: propCurrentPrice,
  originalPrice: propOriginalPrice,
  discountPercent: propDiscountPercent,
  showPerHour = false,
  weekendRates: propWeekendRates,
  peakRates: propPeakRates,
  isSelected = false,
  onSelect,
  className = ''
}) => {
  // Resolve data either from court model or direct props
  let title = propTitle || court?.name || 'Turf Pitch';
  let duration = propDuration ?? court?.slot_duration_minutes ?? 60;
  
  // Timings
  let openTimeStr = propOpeningTime || (court?.opening_time ? formatTime12hPlain(court.opening_time) : '06:00 AM');
  let closeTimeStr = propClosingTime || (court?.closing_time ? formatTime12hPlain(court.closing_time) : '11:00 PM');

  // Offer calculation from Court model
  let isOfferActive = true;
  if (court?.offer_end_date && selectedDate) {
    isOfferActive = selectedDate <= court.offer_end_date;
  }

  let offerText = propOfferText;
  if (offerText === undefined && court) {
    const hasOffer = Boolean(
      (court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour) ||
      (court.saturday_offer_price_per_hour && court.saturday_offer_price_per_hour !== (court.saturday_price_per_hour || court.base_price_per_hour)) ||
      (court.sunday_offer_price_per_hour && court.sunday_offer_price_per_hour !== (court.sunday_price_per_hour || court.base_price_per_hour)) ||
      (court.peak_offer_price_per_hour && court.peak_offer_price_per_hour !== (court.peak_price_per_hour || 1800))
    );

    if (hasOffer && isOfferActive) {
      offerText = `🎉 OFFER ACTIVE${court.offer_end_date ? ` (TILL ${formatDateDDMMYYYY(court.offer_end_date)})` : ''}`;
    } else {
      offerText = null;
    }
  }

  // Weekday Price
  let currentPrice = propCurrentPrice;
  let originalPrice = propOriginalPrice;
  let discountPercent = propDiscountPercent;

  if (currentPrice === undefined && court) {
    if (isOfferActive && court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour) {
      currentPrice = court.base_price_per_hour;
      originalPrice = court.original_price_per_hour;
      discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    } else {
      currentPrice = isOfferActive ? court.base_price_per_hour : (court.original_price_per_hour || court.base_price_per_hour);
      originalPrice = undefined;
      discountPercent = undefined;
    }
  }

  // Weekend Rates
  let weekendRates = propWeekendRates;
  if (weekendRates === undefined && court) {
    const satBase = court.saturday_price_per_hour || court.base_price_per_hour;
    const sunBase = court.sunday_price_per_hour || court.base_price_per_hour;
    const satOffer = court.saturday_offer_price_per_hour;
    const sunOffer = court.sunday_offer_price_per_hour;

    const satHasOffer = Boolean(isOfferActive && satOffer && satOffer !== satBase);
    const sunHasOffer = Boolean(isOfferActive && sunOffer && sunOffer !== sunBase);

    weekendRates = {
      saturday: satHasOffer ? {
        price: Math.min(satBase, satOffer!),
        originalPrice: Math.max(satBase, satOffer!)
      } : {
        price: satBase
      },
      sunday: sunHasOffer ? {
        price: Math.min(sunBase, sunOffer!),
        originalPrice: Math.max(sunBase, sunOffer!)
      } : {
        price: sunBase
      }
    };
  }

  // Evening Peak Rates
  let peakRates = propPeakRates;
  if (peakRates === undefined && court && court.peak_enabled) {
    const pkBase = court.peak_price_per_hour || 1800;
    let pkOffer = court.peak_offer_price_per_hour;
    if (pkOffer === undefined && court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour) {
      const discountRatio = (court.original_price_per_hour - court.base_price_per_hour) / court.original_price_per_hour;
      pkOffer = Math.round(pkBase * (1 - discountRatio));
    }

    const hasPkOffer = Boolean(isOfferActive && pkOffer && pkOffer !== pkBase);
    const effectivePeakPrice = hasPkOffer ? Math.min(pkBase, pkOffer!) : pkBase;
    const effectivePeakOriginal = hasPkOffer ? Math.max(pkBase, pkOffer!) : undefined;
    const effectivePeakDiscount = effectivePeakOriginal
      ? Math.round(((effectivePeakOriginal - effectivePeakPrice) / effectivePeakOriginal) * 100)
      : undefined;

    peakRates = {
      enabled: true,
      startTime: formatTime12hPlain(court.peak_start_time || '18:00'),
      endTime: formatTime12hPlain(court.peak_end_time || '23:00'),
      price: effectivePeakPrice,
      originalPrice: effectivePeakOriginal,
      discountPercent: effectivePeakDiscount
    };
  }

  return (
    <div
      onClick={onSelect}
      className={`relative w-full rounded-2xl p-4 sm:p-5 bg-white border shadow-sm transition-all duration-200 cursor-pointer hover:border-emerald-500 hover:shadow-md ${
        isSelected
          ? 'border-emerald-600 ring-2 ring-emerald-500/20 shadow-md'
          : 'border-gray-200'
      } ${className}`}
    >
      {/* 1. Header & Tag Badges + Top-Right Checkmark Badge */}
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-3.5">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {/* Duration Badge */}
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 font-semibold text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            {duration} MIN SESSIONS
          </span>

          {/* Active Offer Badge */}
          {offerText && (
            <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 font-medium text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
              {offerText}
            </span>
          )}
        </div>

        {/* Selected Green Filled Checkmark Badge */}
        {isSelected && (
          <div
            className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ring-2 ring-emerald-600/20"
            title="Selected Pitch"
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
        )}
      </div>

      {/* Turf Title */}
      <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight leading-snug">
        {title}
      </h3>

      {/* Horizontal Divider */}
      <div className="border-t border-gray-100 my-3 sm:my-4" />

      {/* 2. Core Timings & Main Price (Inline Alignment) */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 py-2 sm:py-2.5">
        {/* Timing Label */}
        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-800">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-700 shrink-0" />
          <span>{openTimeStr} - {closeTimeStr}</span>
        </div>

        {/* Pricing Group */}
        <div className="flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-lg sm:text-xl font-extrabold text-emerald-600">
            ₹{currentPrice?.toLocaleString('en-IN') || 0}
          </span>
          {showPerHour && (
            <span className="text-xs font-semibold text-gray-500">/ hr</span>
          )}

          {originalPrice && originalPrice > (currentPrice || 0) && (
            <span className="text-xs sm:text-sm line-through text-gray-400 font-medium">
              ₹{originalPrice.toLocaleString('en-IN')}
            </span>
          )}

          {discountPercent !== undefined && discountPercent > 0 && (
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] sm:text-xxs px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
              {discountPercent}% OFF
            </span>
          )}
        </div>
      </div>

      {/* 3. Weekend Rates Card Container */}
      {weekendRates && (weekendRates.saturday || weekendRates.sunday) && (
        <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-3 sm:p-3.5 mb-2.5 sm:mb-3">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xxs font-bold text-gray-500 tracking-wider uppercase mb-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>WEEKEND RATES</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            {/* Saturday Rate */}
            <div>
              <div className="text-xs sm:text-sm font-bold text-gray-800">
                Sat: ₹{weekendRates.saturday?.price?.toLocaleString('en-IN') || 0}
              </div>
              {weekendRates.saturday?.originalPrice && weekendRates.saturday.originalPrice > weekendRates.saturday.price && (
                <div className="text-[11px] sm:text-xs text-gray-400 font-normal">
                  (was ₹{weekendRates.saturday.originalPrice.toLocaleString('en-IN')})
                </div>
              )}
            </div>

            {/* Sunday Rate */}
            <div>
              <div className="text-xs sm:text-sm font-bold text-gray-800">
                Sun: ₹{weekendRates.sunday?.price?.toLocaleString('en-IN') || 0}
              </div>
              {weekendRates.sunday?.originalPrice && weekendRates.sunday.originalPrice > weekendRates.sunday.price && (
                <div className="text-[11px] sm:text-xs text-gray-400 font-normal">
                  (was ₹{weekendRates.sunday.originalPrice.toLocaleString('en-IN')})
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Evening Peak Box */}
      {peakRates && peakRates.enabled !== false && (
        <div className="bg-amber-50/60 border border-amber-100/50 rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          {/* Title on Left */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-amber-900 tracking-wider uppercase">
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
              <span>EVENING PEAK</span>
            </div>
            <div className="text-[11px] sm:text-xs text-amber-800/80 font-medium mt-0.5">
              ({peakRates.startTime} - {peakRates.endTime})
            </div>
          </div>

          {/* Price Alignment on Right */}
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            {peakRates.originalPrice && peakRates.originalPrice > peakRates.price && (
              <span className="text-xs line-through text-gray-400 font-medium">
                ₹{peakRates.originalPrice.toLocaleString('en-IN')}
              </span>
            )}
            <span className="text-sm sm:text-base font-extrabold text-gray-900">
              ₹{peakRates.price.toLocaleString('en-IN')}
            </span>
            {peakRates.discountPercent !== undefined && peakRates.discountPercent > 0 && (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] sm:text-xxs px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
                {peakRates.discountPercent}% OFF
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


/**
 * Side-by-side interactive demo showcasing Turf A (Selected) and Turf B (Unselected)
 * exactly as styled in the design specifications and reference mock.
 */
export const TurfSelectionCardDemo: React.FC = () => {
  const [selectedId, setSelectedId] = React.useState<string>('turf-a');

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 bg-slate-50/70 rounded-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Turf A - Selected State */}
        <TurfSelectionCard
          id="turf-a"
          title="Turf A — FIFA 5-a-side Synthetic"
          durationMinutes={60}
          offerText="🎉 OFFER ACTIVE (TILL 17/11/2026)"
          openingTime="06:00 AM"
          closingTime="11:00 PM"
          currentPrice={1350}
          originalPrice={1500}
          discountPercent={10}
          weekendRates={{
            saturday: { price: 1440, originalPrice: 1600 },
            sunday: { price: 1440, originalPrice: 1600 }
          }}
          peakRates={{
            enabled: true,
            startTime: '06:00 PM',
            endTime: '11:00 PM',
            price: 1620,
            originalPrice: 1800,
            discountPercent: 10
          }}
          isSelected={selectedId === 'turf-a'}
          onSelect={() => setSelectedId('turf-a')}
        />

        {/* Turf B - Unselected State */}
        <TurfSelectionCard
          id="turf-b"
          title="Turf B — Multi-Sport Arena (Box Cricket / Football)"
          durationMinutes={60}
          offerText="🎉 OFFER ACTIVE (TILL 17/11/2026)"
          openingTime="06:00 AM"
          closingTime="11:00 PM"
          currentPrice={1350}
          originalPrice={1500}
          discountPercent={10}
          weekendRates={{
            saturday: { price: 1440, originalPrice: 1600 },
            sunday: { price: 1440, originalPrice: 1600 }
          }}
          peakRates={{
            enabled: true,
            startTime: '06:00 PM',
            endTime: '11:00 PM',
            price: 1620,
            originalPrice: 1800,
            discountPercent: 10
          }}
          isSelected={selectedId === 'turf-b'}
          onSelect={() => setSelectedId('turf-b')}
        />
      </div>
    </div>
  );
};
