import React, { useState } from 'react';
import { AuthService } from '../../services/authService';
import { AdminUser } from '../../types/schema';
import { ShieldCheck, Lock, Mail, KeyRound, ArrowLeft, AlertCircle, Sparkles } from 'lucide-react';

interface AdminLoginPageProps {
  onLoginSuccess: (admin: AdminUser) => void;
  onSwitchToCustomer: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onSwitchToCustomer
}) => {
  const [identity, setIdentity] = useState('owner@turfflow.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = AuthService.login(identity, password);
      setIsLoading(false);

      if (res.success && res.session) {
        onLoginSuccess(res.session.adminUser);
      } else {
        setError(res.error || 'Authentication failed.');
      }
    }, 400);
  };

  const handleQuickFill = (email: string, pass: string) => {
    setIdentity(email);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col justify-between p-4 relative overflow-hidden">
      {/* Background Decorator */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto w-full flex justify-between items-center py-4 px-2 z-10">
        <button
          onClick={onSwitchToCustomer}
          className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 font-bold hover:shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-primary" /> Back to Customer Portal
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/40">
          <ShieldCheck className="w-4 h-4 text-primary" /> 256-bit Encrypted Security Guard
        </div>
      </header>

      {/* Main Login Form Container */}
      <main className="max-w-md w-full mx-auto my-auto z-10">
        <div className="bg-white rounded-3xl p-8 border border-outline-variant/60 shadow-xl space-y-6">
          {/* Header Badge */}
          <div className="text-center space-y-2">
            <img
              src="/logo.png"
              alt="TurfFlow Logo"
              className="w-20 h-20 rounded-2xl object-contain mx-auto mb-3 p-1 bg-white border border-outline-variant/40 shadow-sm"
            />
            <h1 className="font-headline font-extrabold text-2xl text-primary tracking-tight">
              TurfFlow Operations
            </h1>
            <p className="text-xs text-on-surface-variant font-medium">
              Authorized Management & Staff Access Portal
            </p>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 text-error p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identity Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" /> Admin Email or Username
              </label>
              <input
                type="text"
                required
                value={identity}
                onChange={e => setIdentity(e.target.value)}
                placeholder="e.g. owner@turfflow.com or admin"
                className="w-full px-4 py-3 rounded-2xl border border-outline-variant text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium transition"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-primary" /> Security Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-2xl border border-outline-variant text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium transition"
              />
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-3.5 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" /> Verify Credentials & Access
                </>
              )}
            </button>
          </form>

          {/* Quick Preset Accounts Demo Bar */}
          <div className="pt-4 border-t border-outline-variant/40 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-headline font-bold text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-secondary" /> Quick Demo Fill:
              </span>
              <span className="text-[10px] text-primary">Click to select role</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickFill('owner@turfflow.com', 'admin123')}
                className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-center transition font-semibold text-primary"
              >
                👑 Owner
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('manager@turfflow.com', 'manager123')}
                className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-center transition font-semibold text-primary"
              >
                💼 Manager
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('staff@turfflow.com', 'staff123')}
                className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-center transition font-semibold text-primary"
              >
                📋 Staff
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[11px] text-on-surface-variant z-10">
        TurfFlow Operations Management — Multi-Role Security Module
      </footer>
    </div>
  );
};
