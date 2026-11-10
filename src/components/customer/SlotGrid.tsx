import React from 'react';
import { DynamicSlot } from '../../types/schema';
import { Clock } from 'lucide-react';
import { BookingSlotCard } from './BookingSlotCard';

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

        return (
          <BookingSlotCard
            key={slot.start_time}
            slot={slot}
            isSelected={isSelected}
            onToggle={onToggleSlot}
          />
        );
      })}
    </div>
  );
};
export { BookingSlotCard };
