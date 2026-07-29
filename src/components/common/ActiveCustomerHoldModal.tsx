import React, { useState, useEffect } from 'react';
import { Court } from '../../types/schema';
import { RedisLockService } from '../../services/redisLockService';
import { Clock, X } from 'lucide-react';
import { formatTime12h } from '../../utils/formatters';

interface ActiveCustomerHoldModalProps {
  court: Court;
  date: string;
  time: string;
  onClose: () => void;
}

export const ActiveCustomerHoldModal: React.FC<ActiveCustomerHoldModalProps> = ({
  court,
  date,
  time,
  onClose
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(() => {
    const lockInfo = RedisLockService.checkAdminConflict(court.id, date, time);
    return lockInfo.remainingSeconds;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const lockInfo = RedisLockService.checkAdminConflict(court.id, date, time);
      setRemainingSec(lockInfo.remainingSeconds);
      if (lockInfo.remainingSeconds <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [court.id, date, time]);

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const timerDisplay = `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;

  return (
    <div className="modal-overlay z-[9999]">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface">
        <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
          <h3 className="font-headline font-bold text-lg text-sky-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-700 animate-spin" /> Active Customer Hold
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl text-center space-y-1">
          <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">Remaining Hold Time</span>
          <div className="font-mono font-extrabold text-3xl text-sky-900 tracking-wider">
            {remainingSec > 0 ? timerDisplay : 'EXPIRED (00:00)'}
          </div>
          <p className="text-[11px] text-sky-700 font-medium leading-relaxed mt-1">
            Another customer is currently completing their booking. If they do not finish within the remaining hold time, this slot will automatically become free!
          </p>
        </div>

        <div className="bg-surface-container-low p-4 rounded-xl text-xs space-y-2 border border-outline-variant/30 font-medium">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Pitch Arena:</span>
            <strong className="text-on-surface font-bold">{court.name}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Date:</span>
            <strong className="text-on-surface font-bold">{date}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Time Slot:</span>
            <strong className="text-primary font-bold">{formatTime12h(time)}</strong>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-outline-variant/30">
            <span className="text-on-surface-variant">Hold Type:</span>
            <span className="bg-sky-100 text-sky-900 font-extrabold px-2 py-0.5 rounded text-[10px]">
              2-Min Temporary Redis Lock
            </span>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary w-full py-2.5 text-xs font-headline font-bold"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
