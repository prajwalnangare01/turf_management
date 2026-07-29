import React from 'react';
import { DynamicSlot } from '../../types/schema';
import { formatTime12h } from '../../utils/formatters';
import { Clock, ShieldAlert, Zap, Lock, Check } from 'lucide-react';

interface SlotGridProps {
  slots: DynamicSlot[];
  selectedSlots: DynamicSlot[];
  onToggleSlot: (slot: DynamicSlot) => void;
}

export const SlotGrid: React.FC<SlotGridProps> = ({ slots, selectedSlots, onToggleSlot }) => {
  if (slots.length === 0) {
    return (
      <div className="bg-surface-container-low rounded-xl text-center py-12 px-4 border border-outline-variant/40">
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

        return (
          <div
            key={slot.start_time}
            onClick={() => {
              if (slot.status === 'available' || slot.status === 'locked') {
                onToggleSlot(slot);
              }
            }}
            className={`slot-item ${isSelected ? 'selected' : ''} ${
              slot.status === 'booked_online' ? 'booked-online' : ''
            } ${slot.status === 'booked_offline' ? 'booked-offline' : ''} ${
              slot.status === 'blocked' ? 'blocked' : ''
            } ${slot.status === 'locked' && !isSelected ? 'locked' : ''} ${
              slot.status === 'past' ? 'past' : ''
            }`}
          >
            {/* Top row: Time & Peak Tag */}
            <div className="flex items-center justify-between">
              <span className={`font-headline font-bold text-sm tracking-tight ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
                {formatTime12h(slot.start_time)}
              </span>
              {slot.is_peak && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                  isSelected ? 'bg-white/30 text-on-secondary-container' : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  <Zap className="w-2.5 h-2.5 fill-amber-700" /> PEAK
                </span>
              )}
            </div>

            {/* Selection Checkmark indicator */}
            {isSelected && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-on-secondary-container text-white rounded-full flex items-center justify-center shadow-sm">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}

            {/* Bottom row: Price & Status Pill */}
            <div className="mt-3 flex items-end justify-between">
              {slot.status === 'available' && (
                <>
                  <div>
                    <span className={`text-[10px] block leading-none ${isSelected ? 'text-on-secondary-container/80' : 'text-on-surface-variant'}`}>Rate</span>
                    <span className={`text-sm font-headline font-extrabold ${isSelected ? 'text-on-secondary-container' : 'text-primary'}`}>
                      ₹{slot.price}
                    </span>
                  </div>
                  {!isSelected && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Open
                    </span>
                  )}
                </>
              )}

              {slot.status === 'locked' && (
                <>
                  <div>
                    <span className="text-[10px] text-sky-700 block leading-none">Held</span>
                    <span className="text-sm font-headline font-extrabold text-sky-900">₹{slot.price}</span>
                  </div>
                  <span className="bg-sky-100 text-sky-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 border border-sky-300">
                    <Lock className="w-2.5 h-2.5" /> Held
                  </span>
                </>
              )}

              {slot.status === 'booked_online' && (
                <span className="bg-red-100 text-red-800 text-[9px] px-2 py-0.5 rounded-full font-bold border border-red-200">
                  Booked
                </span>
              )}

              {slot.status === 'booked_offline' && (
                <span className="bg-amber-100 text-amber-900 text-[9px] px-2 py-0.5 rounded-full font-bold border border-amber-200">
                  Walk-in
                </span>
              )}

              {slot.status === 'blocked' && (
                <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-gray-400" />
                  {slot.blocked_reason || 'Blocked'}
                </span>
              )}

              {slot.status === 'past' && (
                <span className="text-[10px] text-gray-400 font-medium">Passed</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
