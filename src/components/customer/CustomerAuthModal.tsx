import React, { useState, useEffect } from 'react';
import { CustomerAuthService } from '../../services/customerAuthService';
import { Customer } from '../../types/schema';
import { 
  User, Phone, Mail, ShieldCheck, KeyRound, Lock, X, Check, 
  Sparkles, AlertCircle, ArrowRight, ArrowLeft, Eye, EyeOff, RefreshCw 
} from 'lucide-react';

interface CustomerAuthModalProps {
  initialTab?: 'login' | 'register';
  noticeMessage?: string;
  onSuccess: (customer: Customer) => void;
  onClose: () => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({ 
  initialTab = 'login',
  noticeMessage,
  onSuccess, 
  onClose 
}) => {
  // Primary two options: 'login' | 'register'
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab);

  // Login Form fields (Credentials only - no SMS OTP)
  const [loginIdentity, setLoginIdentity] = useState('9876543210');
  const [loginPassword, setLoginPassword] = useState('pass123');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register Form fields
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('pass123');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Register OTP verification step (Step 1: Details, Step 2: OTP Verification)
  const [regStep, setRegStep] = useState<'details' | 'otp'>('details');
  const [regOtp, setRegOtp] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Status feedback
  const [notice, setNotice] = useState<string | null>(noticeMessage || null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);

  // Countdown timer for Register OTP resend
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Tab switch handler
  const handleSwitchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    setError(null);
    setNotice(null);
    if (tab === 'register') {
      setRegStep('details');
    }
  };

  // -------------------------
  // LOGIN FLOW (Password only)
  // -------------------------
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.loginWithPassword(loginIdentity, loginPassword);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Authentication failed. Please check your credentials.');
      }
    }, 400);
  };

  const handleQuickSelectDemo = (demoPhone: string) => {
    setLoginIdentity(demoPhone);
    setLoginPassword('pass123');
    setError(null);
    setNotice(null);
  };

  // -------------------------
  // REGISTER FLOW (WITH OTP CHECK)
  // -------------------------
  const handleRegisterSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanPhone = regPhone.replace(/\D/g, '');
    if (!regName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // Check if user already exists
    if (CustomerAuthService.checkPhoneExists(cleanPhone)) {
      setError(`An account with mobile number +91 ${cleanPhone} already exists.`);
      return;
    }

    // Send simulated OTP
    const res = CustomerAuthService.sendOtp(cleanPhone);
    if (res.success) {
      setRegStep('otp');
      setResendCountdown(30);
      setNotice(`Verification code sent to +91 ${cleanPhone}. Demo Code: 1234`);
    } else {
      setError(res.message);
    }
  };

  const handleResendRegisterOtp = () => {
    if (resendCountdown > 0) return;
    setError(null);
    const cleanPhone = regPhone.replace(/\D/g, '');
    const res = CustomerAuthService.sendOtp(cleanPhone);
    if (res.success) {
      setResendCountdown(30);
      setNotice(`New code sent to +91 ${cleanPhone}. Demo Code: 1234`);
    } else {
      setError(res.message);
    }
  };

  const handleRegisterVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.registerWithOtp(
        regName,
        regPhone,
        regOtp,
        regEmail,
        regPassword
      );
      setIsLoading(false);

      if (res.success && res.session) {
        setRegisteredSuccess(true);
        setTimeout(() => {
          if (res.session) {
            onSuccess(res.session.customer);
          }
        }, 600);
      } else {
        setError(res.error || 'Verification failed. Please check the OTP code.');
      }
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-outline-variant/60 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
              ⚽
            </div>
            <div>
              <h3 className="font-headline font-bold text-lg text-primary leading-tight">
                {activeTab === 'login' ? 'Customer Login' : 'Create Customer Account'}
              </h3>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {activeTab === 'login' 
                  ? 'Sign in to reserve your courts & view bookings' 
                  : 'Register with verified mobile number'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container-high transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Two Options: Login & Register */}
        <div className="grid grid-cols-2 gap-1.5 bg-surface-container-low p-1.5 rounded-2xl text-xs font-headline font-bold">
          <button
            type="button"
            onClick={() => handleSwitchTab('login')}
            className={`py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs ${
              activeTab === 'login'
                ? 'bg-primary text-white shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-white/50'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Login</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('register')}
            className={`py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs ${
              activeTab === 'register'
                ? 'bg-primary text-white shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-white/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Register</span>
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-3 rounded-2xl text-xs font-medium flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">
              <span>{error}</span>
              {error.includes('already exists') && activeTab === 'register' && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentity(regPhone);
                      handleSwitchTab('login');
                    }}
                    className="font-bold underline text-error hover:opacity-80"
                  >
                    Switch to Login tab now →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Notice / Demo OTP Banner */}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="leading-snug">{notice}</span>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* OPTION 1: LOGIN FLOW (Password only) */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'login' && (
          <div className="space-y-4">
            <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
              {/* Phone or Email Input */}
              <div className="space-y-1">
                <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-primary" />
                  Mobile Phone Number or Email
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentity}
                  onChange={e => setLoginIdentity(e.target.value)}
                  placeholder="10-digit mobile number or email"
                  className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" /> Password
                  </label>
                  <span className="text-[10px] text-primary/80">Default: pass123</span>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md mt-2"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Fast Fill Buttons */}
            <div className="pt-3 border-t border-outline-variant/40 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-headline font-bold text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-secondary" /> Fast Fill Demo Accounts:
                </span>
                <span className="text-[10px] text-primary">Password: pass123</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickSelectDemo('9876543210')}
                  className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary truncate"
                >
                  👤 Rahul (9876543210)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSelectDemo('9812345678')}
                  className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary truncate"
                >
                  👤 Ananya (9812345678)
                </button>
              </div>
            </div>

            {/* Bottom Register Prompt */}
            <p className="text-center text-[11px] text-on-surface-variant font-medium pt-1">
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => handleSwitchTab('register')}
                className="text-primary font-bold hover:underline"
              >
                Register here
              </button>
            </p>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* OPTION 2: REGISTER FLOW WITH OTP NUMBER VERIFICATION */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'register' && (
          <div>
            {/* Success state */}
            {registeredSuccess ? (
              <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <div>
                  <h4 className="font-headline font-bold text-base text-primary">Mobile Verified & Registered!</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Logging into your account now...</p>
                </div>
              </div>
            ) : regStep === 'details' ? (
              /* Step 1: Customer Details Form */
              <form onSubmit={handleRegisterSendOtp} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" /> Full Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="e.g. Rohan Joshi"
                    className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number (10 digits) <span className="text-error">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs font-bold text-on-surface-variant select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="98765 00000"
                      className="w-full pl-12 pr-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant">We will send an OTP code to verify this phone number.</p>
                </div>

                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-primary" /> Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="e.g. rohan@example.com"
                    className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" /> Create Password
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Enter a secure password (default: pass123)"
                      className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md mt-3"
                >
                  <span>Send OTP to Verify Number</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <p className="text-center text-[11px] text-on-surface-variant font-medium pt-1">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleSwitchTab('login')}
                    className="text-primary font-bold hover:underline"
                  >
                    Sign in here
                  </button>
                </p>
              </form>
            ) : (
              /* Step 2: OTP Verification Form */
              <form onSubmit={handleRegisterVerifyOtpSubmit} className="space-y-4 text-xs">
                {/* Back button & phone confirmation banner */}
                <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setRegStep('details'); setError(null); }}
                      className="text-primary font-bold text-xs flex items-center gap-1 hover:underline"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Edit Details
                    </button>
                    <span className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold">
                      Step 2 of 2
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/30">
                    <span className="text-on-surface-variant">Verifying Mobile:</span>
                    <span className="font-mono font-bold text-on-surface text-sm">
                      +91 {regPhone}
                    </span>
                  </div>
                </div>

                {/* Demo OTP info card */}
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="font-bold text-primary">Demo OTP Verification</p>
                      <p className="text-[11px] text-on-surface-variant">Enter verification code: <strong className="text-primary font-mono font-bold">1234</strong></p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRegOtp('1234')}
                    className="text-[10px] font-bold bg-primary text-white px-2 py-1 rounded-lg hover:bg-primary/90 transition"
                  >
                    Auto-Fill
                  </button>
                </div>

                {/* OTP Input Field */}
                <div className="space-y-1.5">
                  <label className="font-headline font-bold text-on-surface-variant block text-center">
                    Enter 4-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    autoFocus
                    value={regOtp}
                    onChange={e => setRegOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • •"
                    className="w-full max-w-[220px] mx-auto block px-4 py-3 rounded-2xl border-2 border-primary/30 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 bg-surface-container-lowest font-mono font-extrabold tracking-[0.4em] text-center text-xl text-primary"
                  />
                </div>

                {/* Resend OTP Controls */}
                <div className="text-center text-[11px]">
                  {resendCountdown > 0 ? (
                    <span className="text-on-surface-variant font-medium">
                      Resend OTP code in <strong className="text-primary">{resendCountdown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendRegisterOtp}
                      className="text-primary font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Resend OTP Code
                    </button>
                  )}
                </div>

                {/* Complete Registration Button */}
                <button
                  type="submit"
                  disabled={isLoading || regOtp.length < 4}
                  className="w-full btn-cta py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Verify OTP & Create Account</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
