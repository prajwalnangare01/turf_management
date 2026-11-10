import React, { useState } from 'react';
import { AdminUser } from '../../types/schema';
import { AuthService } from '../../services/authService';
import { ShieldAlert, Lock, X, Check, KeyRound } from 'lucide-react';

interface SwitchAdminModalProps {
  targetAdmin: AdminUser;
  currentAdmin: AdminUser;
  onConfirmSwitch: (authenticatedAdmin: AdminUser) => void;
  onClose: () => void;
}

export const SwitchAdminModal: React.FC<SwitchAdminModalProps> = ({
  targetAdmin,
  currentAdmin,
  onConfirmSwitch,
  onClose
}) => {
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      // Authenticate target admin credentials
      const res = AuthService.login(targetAdmin.email, password);
      setIsLoading(false);

      if (res.success && res.session) {
        onConfirmSwitch(res.session.adminUser);
      } else {
        setError(res.error || 'Password verification failed.');
      }
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white rounded-3xl p-3.5 sm:p-5 max-w-sm sm:max-w-md w-full border border-outline-variant/60 shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center pb-1 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center font-bold text-base shadow-xs">
              🔐
            </div>
            <div>
              <h3 className="font-headline font-bold text-sm sm:text-base text-on-surface">Switch Account</h3>
              <p className="text-[10px] text-on-surface-variant">Security verification required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Warning Notice */}
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-xl text-[11px] space-y-0.5">
          <div className="font-headline font-bold flex items-center gap-1 text-amber-900">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Switching to {targetAdmin.name} ({targetAdmin.role.toUpperCase()})
          </div>
          <p className="leading-tight">
            Enter password for <span className="font-mono text-amber-900 font-bold">{targetAdmin.email}</span>:
          </p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-2 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-2.5">
          <div className="space-y-0.5">
            <label className="text-[11px] font-headline font-bold text-on-surface-variant flex items-center gap-1">
              <KeyRound className="w-3 h-3 text-primary" /> Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password (default: admin123 / manager123)"
              className="w-full px-3 py-1.5 rounded-xl border border-outline-variant text-xs focus:outline-none focus:border-primary bg-surface-container-lowest font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-2 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-cta py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Confirm
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
