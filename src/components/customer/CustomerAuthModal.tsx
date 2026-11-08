import React, { useState } from 'react';
import { CustomerAuthService } from '../../services/customerAuthService';
import { EmailVerificationService } from '../../services/emailVerificationService';
import { Customer } from '../../types/schema';
import { User, Phone, Mail, ShieldCheck, KeyRound, Lock, X, Check, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

interface CustomerAuthModalProps {
  onSuccess: (customer: Customer) => void;
  onClose: () => void;
  customNotice?: string | null;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({ onSuccess, onClose, customNotice }) => {
  const [authMethod, setAuthMethod] = useState<'login' | 'signup'>('login');
  
  // Login form fields (Password only)
  const [loginIdentity, setLoginIdentity] = useState('9876543210');
  const [loginPassword, setLoginPassword] = useState('pass123');

  // Sign up form fields (Dual OTP Mandatory: Mobile OTP + Resend Email OTP)
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupMobileOtp, setSignupMobileOtp] = useState('');
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [mobileOtpNotice, setMobileOtpNotice] = useState<string | null>(null);

  const [signupEmail, setSignupEmail] = useState('');
  const [signupEmailOtp, setSignupEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpNotice, setEmailOtpNotice] = useState<string | null>(null);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);

  const [signupPassword, setSignupPassword] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendSignupMobileOtp = () => {
    setError(null);
    setMobileOtpNotice(null);
    if (!signupPhone.trim()) {
      setError('Please enter a 10-digit mobile phone number first.');
      return;
    }
    const res = CustomerAuthService.sendOtp(signupPhone);
    if (res.success) {
      setMobileOtpSent(true);
      setMobileOtpNotice(res.message);
      if (!signupMobileOtp) {
        setSignupMobileOtp('1234');
      }
    } else {
      setError(res.message);
    }
  };

  const handleSendSignupEmailOtp = async () => {
    setError(null);
    setEmailOtpNotice(null);
    const cleanEmail = signupEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address first.');
      return;
    }

    setIsSendingEmailOtp(true);
    try {
      const res = await EmailVerificationService.requestOtp(cleanEmail, 'signup', signupName || 'Player');
      setIsSendingEmailOtp(false);

      if (res.success) {
        setEmailOtpSent(true);
        setEmailOtpNotice(res.message);
        if (res.code && !signupEmailOtp) {
          setSignupEmailOtp(res.code);
        }
      } else {
        setError(res.message || 'Failed to dispatch email verification code via Resend');
      }
    } catch (err: any) {
      setIsSendingEmailOtp(false);
      setError(err?.message || 'Error communicating with Resend email service');
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.loginWithPassword(loginIdentity, loginPassword);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Authentication failed. Please check your credentials.');
      }
    }, 350);
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signupMobileOtp.trim()) {
      setError('Mobile OTP verification is mandatory. Please enter the 4-digit code (Demo code: 1234).');
      return;
    }

    if (!signupEmailOtp.trim()) {
      setError('Email OTP verification is mandatory. Please enter the 6-digit code sent via Resend (Demo code: 123456).');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.register(
        signupName, 
        signupPhone, 
        signupMobileOtp, 
        signupPassword, 
        signupEmail,
        signupEmailOtp
      );
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Registration failed. Please check your details.');
      }
    }, 400);
  };

  const handleQuickDemoLogin = (phone: string, pass: string) => {
    setLoginIdentity(phone);
    setLoginPassword(pass);
    setError(null);
  };

  const handleQuickDemoSignup = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setSignupName(`Player ${randomSuffix}`);
    setSignupPhone(`981234${randomSuffix}`);
    setSignupMobileOtp('1234');
    setMobileOtpSent(true);
    setMobileOtpNotice(`Mobile OTP sent to +91 981234${randomSuffix}. Demo code: 1234`);
    setSignupEmail(`player${randomSuffix}@gmail.com`);
    setSignupEmailOtp('123456');
    setEmailOtpSent(true);
    setEmailOtpNotice(`Email code sent to player${randomSuffix}@gmail.com via Resend. Demo code: 123456`);
    setSignupPassword('pass123');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-outline-variant/60 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-on-surface max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-bold text-lg">
              👤
            </div>
            <div>
              <h3 className="font-headline font-bold text-lg text-primary leading-none">
                {authMethod === 'login' ? 'Customer Log In' : 'Create New Account'}
              </h3>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {authMethod === 'login' 
                  ? 'Access your saved bookings and account' 
                  : 'Dual OTP verified registration (Mobile + Email)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container-high transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Custom Notice Banner */}
        {customNotice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-2.5 rounded-2xl text-xs flex items-start gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{customNotice}</p>
          </div>
        )}

        {/* Tab Switcher: Login and Signup */}
        <div className="grid grid-cols-2 gap-1.5 bg-surface-container-low p-1.5 rounded-2xl text-xs font-headline font-bold">
          <button
            type="button"
            onClick={() => { setAuthMethod('login'); setError(null); }}
            className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
              authMethod === 'login' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Lock className="w-3.5 h-3.5" /> Log In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMethod('signup'); setError(null); }}
            className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
              authMethod === 'signup' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Sign Up <span className="text-[10px] opacity-80">(Dual OTP)</span>
          </button>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* OPTION 1: LOG IN (Password only, no email OTP option) */}
        {authMethod === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number or Email
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

            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" /> Account Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
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
                  <Check className="w-4 h-4" /> Log In
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setAuthMethod('signup'); setError(null); }}
                className="text-xs text-primary hover:underline font-headline font-bold inline-flex items-center gap-1"
              >
                Don't have an account? Sign Up with Dual OTP <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        )}

        {/* OPTION 2: SIGN UP (Both Mobile OTP and Resend Email OTP Mandatory) */}
        {authMethod === 'signup' && (
          <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-xs">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Full Name *
              </label>
              <input
                type="text"
                required
                value={signupName}
                onChange={e => setSignupName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest font-medium"
              />
            </div>

            {/* 1. Mobile Number & Mobile OTP (Mandatory) */}
            <div className="space-y-2 bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40">
              <div className="space-y-1">
                <label className="font-headline font-bold text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-primary" /> Mobile Phone Number *
                  </span>
                  <span className="text-[10px] text-primary font-bold">10 Digits</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    required
                    value={signupPhone}
                    onChange={e => setSignupPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full px-3.5 py-2 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleSendSignupMobileOtp}
                    className="btn-secondary text-[11px] px-3.5 whitespace-nowrap font-bold shrink-0"
                  >
                    {mobileOtpSent ? 'Resend' : 'Send OTP'}
                  </button>
                </div>
              </div>

              {mobileOtpNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{mobileOtpNotice}</span>
                </div>
              )}

              <div className="space-y-1 pt-1">
                <label className="font-headline font-bold text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-secondary" /> 4-Digit Mobile OTP *
                  </span>
                  <span className="text-[10px] text-primary font-bold">Demo: 1234</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={signupMobileOtp}
                  onChange={e => setSignupMobileOtp(e.target.value)}
                  placeholder="Enter 4-digit mobile OTP"
                  className="w-full px-4 py-2 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-bold tracking-widest text-center text-sm"
                />
              </div>
            </div>

            {/* 2. Email Address & Email OTP via Resend (Mandatory) */}
            <div className="space-y-2 bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40">
              <div className="space-y-1">
                <label className="font-headline font-bold text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-primary" /> Email Address *
                  </span>
                  <span className="text-[10px] text-secondary font-bold">Resend Verified</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    placeholder="e.g. rahul.sharma@example.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-medium"
                  />
                  <button
                    type="button"
                    disabled={isSendingEmailOtp}
                    onClick={handleSendSignupEmailOtp}
                    className="btn-secondary text-[11px] px-3.5 whitespace-nowrap font-bold shrink-0 flex items-center gap-1"
                  >
                    {isSendingEmailOtp ? (
                      <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      emailOtpSent ? 'Resend' : 'Send Code'
                    )}
                  </button>
                </div>
              </div>

              {emailOtpNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{emailOtpNotice}</span>
                </div>
              )}

              <div className="space-y-1 pt-1">
                <label className="font-headline font-bold text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-secondary" /> 6-Digit Email Code *
                  </span>
                  <span className="text-[10px] text-primary font-mono font-bold">Demo: 123456</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={signupEmailOtp}
                  onChange={e => setSignupEmailOtp(e.target.value)}
                  placeholder="Enter 6-digit email code"
                  className="w-full px-4 py-2 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-bold tracking-[0.25em] text-center text-sm"
                />
              </div>
            </div>

            {/* Set Password */}
            <div className="space-y-1">
              <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" /> Set Account Password *
              </label>
              <input
                type="password"
                required
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                placeholder="Create a password (min 4 characters)"
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
                  <Check className="w-4 h-4" /> Verify Both OTPs & Register
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setAuthMethod('login'); setError(null); }}
                className="text-xs text-primary hover:underline font-headline font-bold inline-flex items-center gap-1"
              >
                Already have an account? Log In <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        )}

        {/* Demo Fast Fill Section */}
        <div className="pt-2.5 border-t border-outline-variant/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-headline font-bold text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-secondary" /> Demo Quick Fill:
            </span>
            <span className="text-[10px] text-primary">Demo Password: pass123</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('login');
                handleQuickDemoLogin('9876543210', 'pass123');
              }}
              className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary"
            >
              👤 Log In as Rahul
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('signup');
                handleQuickDemoSignup();
              }}
              className="p-2 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-left transition font-semibold text-primary"
            >
              ✨ Sign Up (Dual OTP Auto-Fill)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
