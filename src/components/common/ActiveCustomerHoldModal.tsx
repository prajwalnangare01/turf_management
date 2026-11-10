import React, { useState, useEffect } from 'react';
import { Court } from '../../types/schema';
import { RedisLockService } from '../../services/redisLockService';
import { Clock, X, Sun, Moon } from 'lucide-react';
import { formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';

interface ActiveCustomerHoldModalProps {
  court: Court;
  date: string;
  time: string;
  initialRemainingSec?: number;
  onClose: () => void;
}

export const ActiveCustomerHoldModal: React.FC<ActiveCustomerHoldModalProps> = ({
  court,
  date,
  time,
  initialRemainingSec,
  onClose
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(() => {
    if (initialRemainingSec !== undefined && initialRemainingSec > 0) {
      return initialRemainingSec;
    }
    const lockInfo = RedisLockService.checkAdminConflict(court.id, date, time);
    return lockInfo.remainingSeconds;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSec(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const timerDisplay = `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;

  return (
    <div className="modal-overlay z-[9999]">
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-sm p-3.5 sm:p-5 space-y-2.5 shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
          <h3 className="font-headline font-bold text-sm sm:text-base text-sky-900 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-sky-700 animate-spin" /> Active Customer Hold
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-sky-50 border border-sky-200 p-2.5 rounded-xl text-center space-y-0.5">
          <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider">Remaining Hold Time</span>
          <div className="font-mono font-extrabold text-2xl sm:text-3xl text-sky-900 tracking-wider">
            {remainingSec > 0 ? timerDisplay : 'EXPIRED (00:00)'}
          </div>
          <p className="text-[10.5px] text-sky-700 font-medium leading-tight">
            Another customer is currently completing checkout. If not finished in time, this slot releases automatically.
          </p>
        </div>

        <div className="bg-surface-container-low p-2.5 rounded-xl text-xs space-y-1.5 border border-outline-variant/30 font-medium">
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-[11px]">Arena:</span>
            <strong className="text-on-surface font-bold text-xs truncate max-w-[180px]">{court.name}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-[11px]">Date:</span>
            <strong className="text-on-surface font-bold text-xs">{formatDateDDMMYYYY(date)}</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-on-surface-variant text-[11px]">Time Slot:</span>
            <div className="flex items-center gap-1 font-bold text-primary text-xs">
              <div
                className={`p-0.5 rounded shrink-0 flex items-center justify-center ${
                  parseInt(time.split(':')[0], 10) >= 18 || parseInt(time.split(':')[0], 10) < 5
                    ? 'bg-indigo-50 text-indigo-500'
                    : 'bg-amber-50 text-amber-500'
                }`}
              >
                {parseInt(time.split(':')[0], 10) >= 18 || parseInt(time.split(':')[0], 10) < 5 ? (
                  <Moon className="w-3 h-3" />
                ) : (
                  <Sun className="w-3 h-3" />
                )}
              </div>
              <span>{formatTime12hPlain(time)}</span>
            </div>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-outline-variant/30">
            <span className="text-on-surface-variant text-[10.5px]">Hold Type:</span>
            <span className="bg-sky-100 text-sky-900 font-bold px-1.5 py-0.2 rounded text-[9.5px]">
              Temporary Redis Lock
            </span>
          </div>
        </div>

        <div className="pt-0.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary w-full py-2 text-xs font-headline font-bold cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
