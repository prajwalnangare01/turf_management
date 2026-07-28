import React from 'react';
import { DynamicSlot } from '../../types/schema';
import { Clock, ShieldAlert, Zap, Lock, Check } from 'lucide-react';

interface SlotGridProps {
  slots: DynamicSlot[];
  selectedSlots: DynamicSlot[];
  onToggleSlot: (slot: DynamicSlot) => void;
}

export const SlotGrid: React.FC<SlotGridProps> = ({ slots, selectedSlots, onToggleSlot }) => {
  if (slots.length === 0) {
    return (
      <div className="glass-card text-center py-16 px-4">
        <Clock className="w-12 h-12 mx-auto mb-3 text-slate-500 opacity-50" />
        <p className="text-sm font-semibold text-slate-300">No available slots found for the selected court & date.</p>
        <p className="text-xs text-slate-500 mt-1">Try selecting a different date or sport from the strip above.</p>
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
              <span className="font-extrabold text-sm text-white tracking-tight">
                {slot.start_time}
              </span>
              {slot.is_peak && (
                <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5 fill-amber-300" /> PEAK
                </span>
              )}
            </div>

            {/* Selection Checkmark indicator */}
            {isSelected && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-400 text-slate-950 rounded-full flex items-center justify-center shadow-md">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}

            {/* Bottom row: Price & Status Pill */}
            <div className="mt-3 flex items-end justify-between">
              {slot.status === 'available' && (
                <>
                  <div>
                    <span className="text-[10px] text-slate-400 block leading-none">Slot Price</span>
                    <span className="text-sm font-extrabold text-emerald-400">₹{slot.price}</span>
                  </div>
                  <span className="badge-neon badge-neon-emerald text-[9px] px-1.5 py-0.5">
                    Available
                  </span>
                </>
              )}

              {slot.status === 'locked' && (
                <>
                  <div>
                    <span className="text-[10px] text-cyan-400/80 block leading-none">Locked</span>
                    <span className="text-sm font-extrabold text-cyan-300">₹{slot.price}</span>
                  </div>
                  <span className="badge-neon badge-neon-cyan text-[9px] px-1.5 py-0.5 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Held
                  </span>
                </>
              )}

              {slot.status === 'booked_online' && (
                <span className="badge-neon badge-neon-rose text-[9px] px-1.5 py-0.5">
                  Booked (Online)
                </span>
              )}

              {slot.status === 'booked_offline' && (
                <span className="badge-neon badge-neon-amber text-[9px] px-1.5 py-0.5">
                  Booked (Walk-in)
                </span>
              )}

              {slot.status === 'blocked' && (
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-slate-500" />
                  {slot.blocked_reason || 'Blocked'}
                </span>
              )}

              {slot.status === 'past' && (
                <span className="text-[10px] text-slate-500 font-semibold">Passed</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
