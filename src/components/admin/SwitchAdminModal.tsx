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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-outline-variant/60 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
              🔐
            </div>
            <div>
              <h3 className="font-headline font-bold text-base text-on-surface">Re-authenticate Account Switch</h3>
              <p className="text-xs text-on-surface-variant">Security verification required for role change</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Warning Notice */}
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl text-xs space-y-1">
          <div className="font-headline font-bold flex items-center gap-1.5 text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" /> Authorization Guard Active
          </div>
          <p>
            You are switching from <strong>{currentAdmin.name} ({currentAdmin.role.toUpperCase()})</strong> to{' '}
            <strong>{targetAdmin.name} ({targetAdmin.role.toUpperCase()})</strong>. Please enter the password for{' '}
            <span className="font-mono text-amber-900 font-bold">{targetAdmin.email}</span> to verify authorization.
          </p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-3 rounded-2xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-primary" /> Password for {targetAdmin.name}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password (default: admin123 / manager123 / staff123)"
              className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs px-4 py-2.5 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-cta text-xs px-5 py-2.5 font-headline font-bold flex items-center gap-1.5 shadow-md"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" /> Confirm & Switch Role
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
