import React from 'react';
import { DynamicSlot } from '../../types/schema';
import { formatTime12h } from '../../utils/formatters';
import { Clock, ShieldAlert, Zap, Lock, Check, Tag } from 'lucide-react';

interface SlotGridProps {
  slots: DynamicSlot[];
  selectedSlots: DynamicSlot[];
  onToggleSlot: (slot: DynamicSlot) => void;
}

export const SlotGrid: React.FC<SlotGridProps> = ({ slots, selectedSlots, onToggleSlot }) => {
  if (slots.length === 0) {
    return (
      <div className="bg-surface-container-low rounded-2xl text-center py-12 px-4 border border-outline-variant/40">
        <Clock className="w-10 h-10 mx-auto mb-2 text-outline" />
        <p className="text-sm font-headline font-bold text-on-surface">No available slots found for the selected court & date.</p>
        <p className="text-xs text-on-surface-variant mt-1">Try selecting a different date or sport arena above.</p>
      </div>
    );
  }

  return (
    <div className="slot-grid-container">
      {slots.map((slot) => {
        const isSelected = selectedSlots.some(s => s.start_time === slot.start_time);
        const hasDiscount = Boolean(slot.original_price && slot.original_price > slot.price);
        const discountPct = hasDiscount && slot.original_price
          ? Math.round(((slot.original_price - slot.price) / slot.original_price) * 100)
          : 0;
        const saveAmount = hasDiscount && slot.original_price
          ? slot.original_price - slot.price
          : 0;

        return (
          <div
            key={slot.start_time}
            onClick={() => {
              if (slot.status === 'available' || slot.status === 'locked') {
                onToggleSlot(slot);
              }
            }}
            className={`slot-item ${isSelected ? 'selected' : ''} ${
              (slot.status === 'booked_online' || slot.status === 'booked_offline') ? 'booked-online' : ''
            } ${
              slot.status === 'blocked' ? 'blocked' : ''
            } ${slot.status === 'locked' && !isSelected ? 'locked' : ''} ${
              slot.status === 'past' ? 'past' : ''
            }`}
          >
            {/* Top row: Time & Status Badges */}
            <div className="flex items-center justify-between">
              <span className={`font-headline font-bold text-sm tracking-tight ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
                {formatTime12h(slot.start_time)}
              </span>

              {/* Header Right Status Pill / Icon */}
              {isSelected ? (
                <div className="w-5 h-5 bg-on-secondary-container text-white rounded-full flex items-center justify-center shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : slot.status === 'locked' ? (
                <span className="bg-sky-100 text-sky-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 border border-sky-300">
                  <Lock className="w-2.5 h-2.5" /> Held
                </span>
              ) : slot.is_peak && slot.status === 'available' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 bg-amber-100 text-amber-900 border border-amber-300">
                  <Zap className="w-2.5 h-2.5 fill-amber-700" /> PEAK
                </span>
              ) : slot.status === 'available' ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  Open
                </span>
              ) : (slot.status === 'booked_online' || slot.status === 'booked_offline') ? (
                <span className="bg-red-100 text-red-800 text-[9px] px-2 py-0.5 rounded-full font-bold border border-red-200">
                  Booked
                </span>
              ) : slot.status === 'blocked' ? (
                <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-gray-400" />
                  {slot.blocked_reason || 'Blocked'}
                </span>
              ) : slot.status === 'past' ? (
                <span className="text-[10px] text-gray-400 font-medium">Passed</span>
              ) : null}
            </div>

            {/* Middle row: High-Impact Dedicated Offer Badge */}
            {hasDiscount && (slot.status === 'available' || slot.status === 'locked') && (
              <div
                className={`my-1.5 py-0.5 px-2 rounded-md flex items-center justify-between text-[10px] font-bold transition-colors ${
                  isSelected
                    ? 'bg-black/10 text-on-secondary-container border border-black/10'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs'
                }`}
              >
                <span className="font-black flex items-center gap-1 tracking-tight">
                  <Tag className={`w-2.5 h-2.5 ${isSelected ? 'text-on-secondary-container' : 'text-emerald-700'}`} />
                  {discountPct}% OFF
                </span>
                <span className={`text-[9.5px] font-extrabold ${isSelected ? 'text-on-secondary-container/90' : 'text-emerald-700'}`}>
                  Save ₹{saveAmount}
                </span>
              </div>
            )}

            {/* Bottom row: Clean Price & Unit Footer */}
            <div
              className={`flex items-baseline justify-between ${
                hasDiscount ? 'pt-1.5 border-t' : 'mt-3'
              } ${
                isSelected
                  ? 'border-secondary/30'
                  : 'border-outline-variant/20'
              }`}
            >
              {slot.status === 'available' && (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-base font-headline font-black leading-none ${isSelected ? 'text-on-secondary-container' : 'text-primary'}`}>
                      ₹{slot.price}
                    </span>
                    {hasDiscount && (
                      <span className={`text-xs font-semibold line-through leading-none ${isSelected ? 'text-on-secondary-container/60' : 'text-slate-400'}`}>
                        ₹{slot.original_price}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9.5px] font-medium ${isSelected ? 'text-on-secondary-container/70' : 'text-slate-400'}`}>
                    /session
                  </span>
                </>
              )}

              {slot.status === 'locked' && (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-headline font-black text-sky-900 leading-none">₹{slot.price}</span>
                    {hasDiscount && (
                      <span className="text-xs font-semibold text-sky-400 line-through leading-none">
                        ₹{slot.original_price}
                      </span>
                    )}
                  </div>
                  <span className="text-[9.5px] text-sky-600 font-medium">Temporary Hold</span>
                </>
              )}

              {(slot.status === 'booked_online' || slot.status === 'booked_offline') && (
                <span className="text-[10px] text-red-600 font-medium">Reserved by player</span>
              )}

              {slot.status === 'blocked' && (
                <span className="text-[10px] text-gray-400 font-medium">Slot unavailable</span>
              )}

              {slot.status === 'past' && (
                <span className="text-[10px] text-gray-400 font-medium">Match concluded</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
