import React, { useState } from 'react';
import { CustomerAuthService } from '../../services/customerAuthService';
import { Customer } from '../../types/schema';
import { User, Phone, Mail, ShieldCheck, KeyRound, Lock, X, Check, Sparkles, AlertCircle } from 'lucide-react';

interface CustomerAuthModalProps {
  onSuccess: (customer: Customer) => void;
  onClose: () => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({ onSuccess, onClose }) => {
  const [authMethod, setAuthMethod] = useState<'password' | 'otp' | 'register'>('password');
  
  // Form fields
  const [phone, setPhone] = useState('9876543210');
  const [password, setPassword] = useState('pass123');
  const [otp, setOtp] = useState('1234');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOtp = () => {
    setError(null);
    const res = CustomerAuthService.sendOtp(phone);
    if (res.success) {
      setOtpSent(true);
      setOtpNotice(res.message);
    } else {
      setError(res.message);
    }
  };

  const handlePasswordLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.loginWithPassword(phone, password);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Authentication failed.');
      }
    }, 400);
  };

  const handleOtpLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.loginWithOtp(phone, otp);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Authentication failed.');
      }
    }, 400);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.register(name, phone, email, password);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Registration failed.');
      }
    }, 400);
  };

  const handleQuickSelectDemo = (demoPhone: string, demoName: string) => {
    setPhone(demoPhone);
    setPassword('pass123');
    setOtp('1234');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-outline-variant/60 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-bold text-lg">
              👤
            </div>
            <div>
              <h3 className="font-headline font-bold text-lg text-primary leading-none">Customer Account</h3>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Password & OTP Verified Login</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container-high transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 bg-surface-container-low p-1 rounded-2xl text-xs font-headline font-bold">
          <button
            onClick={() => { setAuthMethod('password'); setError(null); }}
            className={`py-2 px-1 rounded-xl transition text-[11px] ${authMethod === 'password' ? 'bg-primary text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            🔑 Password
          </button>
          <button
            onClick={() => { setAuthMethod('otp'); setError(null); }}
            className={`py-2 px-1 rounded-xl transition text-[11px] ${authMethod === 'otp' ? 'bg-primary text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            📱 OTP Login
          </button>
          <button
            onClick={() => { setAuthMethod('register'); setError(null); }}
            className={`py-2 px-1 rounded-xl transition text-[11px] ${authMethod === 'register' ? 'bg-primary text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            ✨ Register
          </button>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {otpNotice && authMethod === 'otp' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{otpNotice}</span>
          </div>
        )}

        {authMethod === 'password' && (
          <form onSubmit={handlePasswordLoginSubmit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number or Email
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="10-digit phone or email"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" /> Account Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password (default: pass123)"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" /> Sign In with Password
                </>
              )}
            </button>
          </form>
        )}

        {authMethod === 'otp' && (
          <form onSubmit={handleOtpLoginSubmit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                />
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="btn-secondary text-[11px] px-3 whitespace-nowrap font-bold shrink-0"
                >
                  {otpSent ? 'Resend' : 'Send OTP'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-primary" /> Enter 4-Digit Verification Code
              </label>
              <input
                type="text"
                required
                maxLength={4}
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="Demo OTP: 1234"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-mono font-bold tracking-widest text-center text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" /> Verify OTP & Sign In
                </>
              )}
            </button>
          </form>
        )}

        {authMethod === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" /> Email Address (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. rahul@example.com"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" /> Set Account Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create password (default: pass123)"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" /> Create Account & Continue
                </>
              )}
            </button>
          </form>
        )}

        {/* Demo Fast Fill Accounts */}
        <div className="pt-3 border-t border-outline-variant/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-headline font-bold text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-secondary" /> Demo Fill:
            </span>
            <span className="text-[10px] text-primary">Password: pass123</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickSelectDemo('9876543210', 'Rahul Sharma')}
              className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary"
            >
              👤 Rahul (9876543210)
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelectDemo('9812345678', 'Ananya Verma')}
              className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary"
            >
              👤 Ananya (9812345678)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
