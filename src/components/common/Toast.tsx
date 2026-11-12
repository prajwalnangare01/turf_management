import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  isOpen: boolean;
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  durationMs?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  isOpen,
  type = 'success',
  title,
  message,
  durationMs = 5000,
  onClose
}) => {
  const [progress, setProgress] = useState(100);
  const onCloseRef = useRef(onClose);

  // Keep latest onClose callback without retriggering timer on parent re-renders
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remainingPct);
      if (elapsed >= durationMs) {
        clearInterval(interval);
        onCloseRef.current?.();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isOpen, durationMs, message, title]);

  if (!isOpen) return null;

  const icon =
    type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> :
    type === 'error' ? <AlertCircle className="w-5 h-5 text-red-600 shrink-0" /> :
    type === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /> :
    <Info className="w-5 h-5 text-sky-600 shrink-0" />;

  const borderBg =
    type === 'success' ? 'border-emerald-200 bg-emerald-50/95 text-emerald-950' :
    type === 'error' ? 'border-red-200 bg-red-50/95 text-red-950' :
    type === 'warning' ? 'border-amber-200 bg-amber-50/95 text-amber-950' :
    'border-sky-200 bg-sky-50/95 text-sky-950';

  const progressBg =
    type === 'success' ? 'bg-emerald-500' :
    type === 'error' ? 'bg-red-500' :
    type === 'warning' ? 'bg-amber-500' :
    'bg-sky-500';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-5 right-5 z-[10001] max-w-sm sm:max-w-md w-[calc(100vw-2.5rem)] pointer-events-auto transition-all animate-modalScaleIn shadow-2xl"
      style={{ zIndex: 10001 }}
    >
      <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-md p-3.5 sm:p-4 shadow-xl ${borderBg}`}>
        <div className="flex items-start gap-3">
          <div className="p-1 rounded-xl bg-white shadow-2xs border border-outline-variant/30 shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0 pr-1">
            {title && (
              <h4 className="font-headline font-extrabold text-xs sm:text-sm leading-tight text-on-surface mb-0.5">
                {title}
              </h4>
            )}
            <p className="text-[11px] sm:text-xs leading-relaxed text-on-surface-variant font-medium">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant/70 hover:text-on-surface p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss toast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Progress Timer Line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5">
          <div
            className={`h-full transition-all duration-75 ease-linear ${progressBg}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
