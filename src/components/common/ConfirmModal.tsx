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
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface relative z-[10000]">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 shrink-0">
            {icon}
          </div>
          <div className="space-y-1 flex-1">
            <h3 className="font-headline font-bold text-lg text-on-surface">{title}</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed font-medium">{message}</p>
          </div>
          <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1 py-2.5 text-xs font-bold"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-xs font-headline font-bold rounded-xl transition-all shadow-sm ${btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
