import React from 'react';
import { AlertTriangle, CheckCircle2, Trash2, HelpCircle, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'success' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm Action',
  cancelText = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const icon = variant === 'danger' ? <Trash2 className="w-7 h-7 text-red-600" /> :
               variant === 'success' ? <CheckCircle2 className="w-7 h-7 text-emerald-600" /> :
               variant === 'warning' ? <AlertTriangle className="w-7 h-7 text-amber-600" /> :
               <HelpCircle className="w-7 h-7 text-primary" />;

  const btnBg = variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' :
                variant === 'success' ? 'bg-primary hover:bg-primary-container text-white' :
                variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700 text-white' :
                'bg-primary hover:bg-primary-container text-white';

  return (
    <div className="modal-overlay z-[9999]" style={{ zIndex: 9999 }}>
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-sm p-3.5 sm:p-5 space-y-3 shadow-2xl animate-modalScaleIn text-on-surface relative z-[10000] overflow-hidden">
        <div className="flex items-start gap-2.5">
          <div className="p-2 bg-surface-container-low rounded-xl border border-outline-variant/30 shrink-0">
            {icon}
          </div>
          <div className="space-y-0.5 flex-1 min-w-0">
            <h3 className="font-headline font-bold text-base text-on-surface leading-tight">{title}</h3>
            <p className="text-[11px] text-on-surface-variant leading-relaxed font-medium">{message}</p>
          </div>
          <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary py-2 text-xs font-bold"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`py-2 text-xs font-headline font-bold rounded-xl transition-all shadow-xs cursor-pointer ${btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
