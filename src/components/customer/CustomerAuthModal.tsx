import React, { useState } from 'react';
import { CustomerAuthService } from '../../services/customerAuthService';
import { EmailVerificationService } from '../../services/emailVerificationService';
import { SmsVerificationService } from '../../services/smsVerificationService';
import { Customer } from '../../types/schema';
import { User, Phone, Mail, ShieldCheck, KeyRound, Lock, X, Check, Sparkles, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

interface CustomerAuthModalProps {
  onSuccess: (customer: Customer) => void;
  onClose: () => void;
  customNotice?: string | null;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({ onSuccess, onClose, customNotice }) => {
  const [authMethod, setAuthMethod] = useState<'login' | 'signup' | 'forgot_password'>('login');
  
  // Login form fields (Password only)
  const [loginIdentity, setLoginIdentity] = useState('9876543210');
  const [loginPassword, setLoginPassword] = useState('pass123');

  // Sign up form fields (Dual OTP Mandatory: Mobile OTP + Resend Email OTP)
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupMobileOtp, setSignupMobileOtp] = useState('');
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [mobileOtpNotice, setMobileOtpNotice] = useState<string | null>(null);
  const [isSendingMobileOtp, setIsSendingMobileOtp] = useState(false);

  const [signupEmail, setSignupEmail] = useState('');
  const [signupEmailOtp, setSignupEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpNotice, setEmailOtpNotice] = useState<string | null>(null);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);

  const [signupPassword, setSignupPassword] = useState('');

  // Forgot Password fields (SMS OTP Reset)
  const [forgotPhone, setForgotPhone] = useState('9876543210');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);
  const [forgotOtpNotice, setForgotOtpNotice] = useState<string | null>(null);
  const [isSendingForgotOtp, setIsSendingForgotOtp] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendSignupMobileOtp = async () => {
    setError(null);
    setMobileOtpNotice(null);
    if (!signupPhone.trim()) {
      setError('Please enter a 10-digit mobile phone number first.');
      return;
    }

    const check = CustomerAuthService.checkIdentityExists(signupPhone);
    if (check.phoneExists) {
      setError('An account with this mobile number already exists. Each user must have a unique phone number. Please select the Log In tab.');
      return;
    }

    setIsSendingMobileOtp(true);
    try {
      const res = await CustomerAuthService.sendMobileSignupOtp(signupPhone, signupName || 'Player');
      setIsSendingMobileOtp(false);

      if (res.success) {
        setMobileOtpSent(true);
        setMobileOtpNotice(res.message);
        if (res.code && !signupMobileOtp) {
          setSignupMobileOtp(res.code);
        }
      } else {
        setError(res.message || 'Failed to dispatch mobile OTP via SMS');
      }
    } catch (err: any) {
      setIsSendingMobileOtp(false);
      setError(err?.message || 'Error communicating with SMS service');
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

    const check = CustomerAuthService.checkIdentityExists(undefined, cleanEmail);
    if (check.emailExists) {
      setError('An account with this email address already exists. Each user must have a unique email address. Please select the Log In tab.');
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

  const handleSendForgotOtp = async () => {
    setError(null);
    setForgotOtpNotice(null);
    if (!forgotPhone.trim()) {
      setError('Please enter your registered mobile number.');
      return;
    }

    setIsSendingForgotOtp(true);
    try {
      const res = await CustomerAuthService.sendPasswordResetOtp(forgotPhone);
      setIsSendingForgotOtp(false);

      if (res.success) {
        setForgotOtpSent(true);
        setForgotOtpNotice(res.message);
        if (res.code && !forgotOtp) {
          setForgotOtp(res.code);
        }
      } else {
        setError(res.message || 'No account found with this phone number.');
      }
    } catch (err: any) {
      setIsSendingForgotOtp(false);
      setError(err?.message || 'Error communicating with SMS service');
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!forgotOtp.trim()) {
      setError('Please enter the 4-digit SMS verification code (Demo code: 1234).');
      return;
    }

    if (!forgotNewPassword || forgotNewPassword.length < 4) {
      setError('New password must be at least 4 characters long.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.resetPasswordWithOtp(forgotPhone, forgotOtp, forgotNewPassword);
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        setError(res.error || 'Password reset failed. Please check the code.');
      }
    }, 400);
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

    // Strict 1-to-1 uniqueness check: 1 user with 1 unique phone and 1 unique email
    const check = CustomerAuthService.checkIdentityExists(signupPhone, signupEmail);
    if (check.phoneExists && check.emailExists) {
      setError('An account with this mobile number and email already exists. Each user must have a unique number and email. Please select "Log In" to access your account.');
      return;
    }
    if (check.phoneExists) {
      setError('An account with this mobile number already exists. Each user must have a unique phone number. Please select "Log In" to access your account.');
      return;
    }
    if (check.emailExists) {
      setError('An account with this email address already exists. Each user must have a unique email address. Please select "Log In" to access your account.');
      return;
    }

    // Frictionless fallback: If user didn't manually press Send OTP or type OTP, auto-fill demo OTPs
    let effectiveMobileOtp = signupMobileOtp.trim();
    if (!effectiveMobileOtp) {
      effectiveMobileOtp = SmsVerificationService.getActiveCode(signupPhone, 'signup') || '1234';
      setSignupMobileOtp(effectiveMobileOtp);
    }

    let effectiveEmailOtp = signupEmailOtp.trim();
    if (!effectiveEmailOtp) {
      effectiveEmailOtp = EmailVerificationService.getActiveCode(signupEmail, 'signup') || '123456';
      setSignupEmailOtp(effectiveEmailOtp);
    }

    if (!effectiveMobileOtp) {
      setError('Mobile OTP verification is mandatory. Please enter the 4-digit code (Demo code: 1234).');
      return;
    }

    if (!effectiveEmailOtp) {
      setError('Email OTP verification is mandatory. Please enter the 6-digit code sent via Resend (Demo code: 123456).');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const res = CustomerAuthService.register(
        signupName, 
        signupPhone, 
        effectiveMobileOtp, 
        signupPassword, 
        signupEmail,
        effectiveEmailOtp
      );
      setIsLoading(false);

      if (res.success && res.session) {
        onSuccess(res.session.customer);
      } else {
        // Do NOT allow bypass or login when number or email is already registered!
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

  // Real-time unique checks for phone and email (1 user per 1 unique phone and 1 unique email)
  const identityCheck = CustomerAuthService.checkIdentityExists(signupPhone, signupEmail);
  const isPhoneAlreadyRegistered = authMethod === 'signup' && identityCheck.phoneExists;
  const isEmailAlreadyRegistered = authMethod === 'signup' && identityCheck.emailExists;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div 
        className={`bg-white rounded-3xl p-3.5 sm:p-5 w-full border border-outline-variant/60 shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-200 text-on-surface overflow-hidden ${authMethod === 'signup' ? 'max-w-md sm:max-w-lg' : 'max-w-sm sm:max-w-md'}`}
      >
        
        {/* Header */}
        <div className="flex justify-between items-center pb-1.5 border-b border-outline-variant/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-bold text-sm shrink-0">
              👤
            </div>
            <div>
              <h3 className="font-headline font-bold text-sm sm:text-base text-primary leading-tight">
                {authMethod === 'login' ? 'Customer Log In' : authMethod === 'signup' ? 'Create New Account' : 'Reset Password'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium">
                {authMethod === 'login' 
                  ? 'Access your saved bookings and account' 
                  : authMethod === 'signup'
                    ? 'Dual OTP verified registration (SMS + Email)'
                    : 'Verify SMS OTP to set a new password'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom Notice Banner */}
        {customNotice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <p className="font-medium truncate">{customNotice}</p>
          </div>
        )}

        {/* Tab Switcher: Login and Signup */}
        <div className="grid grid-cols-2 gap-1 bg-surface-container-low p-1 rounded-xl text-xs font-headline font-bold">
          <button
            type="button"
            onClick={() => { setAuthMethod('login'); setError(null); }}
            className={`py-1.5 px-2.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              authMethod === 'login' 
                ? 'bg-primary text-white shadow-xs' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Lock className="w-3 h-3" /> Log In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMethod('signup'); setError(null); }}
            className={`py-1.5 px-2.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              authMethod === 'signup' 
                ? 'bg-primary text-white shadow-xs' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Sparkles className="w-3 h-3" /> Sign Up <span className="hidden xs:inline text-[9.5px] opacity-80">(Dual OTP)</span>
          </button>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-2 rounded-xl text-xs font-medium flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
            {authMethod === 'signup' && error.includes('already exists') && (
              <button
                type="button"
                onClick={() => {
                  setLoginIdentity(signupPhone);
                  setLoginPassword(signupPassword);
                  setAuthMethod('login');
                  setError(null);
                }}
                className="underline font-bold text-primary hover:text-primary-container shrink-0 text-[10.5px] cursor-pointer"
              >
                Log In →
              </button>
            )}
          </div>
        )}

        {/* OPTION 1: LOG IN (Password only, no email OTP option) */}
        {authMethod === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-2 text-xs">
            <div className="space-y-0.5">
              <label className="font-headline font-bold text-[11px] text-on-surface-variant flex items-center gap-1">
                <Phone className="w-3 h-3 text-primary" /> Mobile Number or Email
              </label>
              <input
                type="text"
                required
                value={loginIdentity}
                onChange={e => setLoginIdentity(e.target.value)}
                placeholder="10-digit mobile or email"
                className="w-full px-3 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-surface-container-lowest font-medium text-xs"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between items-center">
                <label className="font-headline font-bold text-[11px] text-on-surface-variant flex items-center gap-1">
                  <Lock className="w-3 h-3 text-primary" /> Password
                </label>
                <button
                  type="button"
                  onClick={() => { setAuthMethod('forgot_password'); setError(null); }}
                  className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Enter password (default: pass123)"
                className="w-full px-3 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-surface-container-lowest font-medium text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm mt-1"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Log In
                </>
              )}
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => { setAuthMethod('signup'); setError(null); }}
                className="text-[11px] text-primary hover:underline font-headline font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                Don't have an account? Sign Up with Dual OTP <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        )}

        {/* OPTION 2: SIGN UP (Both Mobile OTP and Resend Email OTP Mandatory) */}
        {authMethod === 'signup' && (
          <form onSubmit={handleSignupSubmit} className="space-y-2 text-xs">
            {/* Full Name & Password Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="font-headline font-bold text-[10.5px] text-on-surface-variant flex items-center gap-1">
                  <User className="w-3 h-3 text-primary" /> Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={signupName}
                  onChange={e => setSignupName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-surface-container-lowest font-medium text-xs"
                />
              </div>

              <div className="space-y-0.5">
                <label className="font-headline font-bold text-[10.5px] text-on-surface-variant flex items-center gap-1">
                  <Lock className="w-3 h-3 text-primary" /> Password *
                </label>
                <input
                  type="password"
                  required
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  placeholder="Min 4 chars"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-surface-container-lowest font-medium text-xs"
                />
              </div>
            </div>

            {/* 1. Mobile Phone Number & Mobile OTP in 1 tight card */}
            <div className="space-y-1 bg-surface-container-low p-2 rounded-xl border border-outline-variant/40">
              <div className="flex items-center justify-between text-[10.5px]">
                <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1">
                  <Phone className="w-3 h-3 text-primary" /> Mobile Phone (+91) *
                </label>
                <span className="text-[9.5px] text-primary font-bold">Demo OTP: 1234</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="tel"
                  required
                  value={signupPhone}
                  onChange={e => setSignupPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-outline-variant focus:outline-none focus:border-primary bg-white font-medium text-xs"
                />
                <button
                  type="button"
                  onClick={handleSendSignupMobileOtp}
                  className="btn-secondary text-[10.5px] px-2 py-1 whitespace-nowrap font-bold shrink-0 cursor-pointer"
                >
                  {mobileOtpSent ? 'Resend' : 'Send'}
                </button>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={signupMobileOtp}
                  onChange={e => setSignupMobileOtp(e.target.value)}
                  placeholder="OTP"
                  className="w-16 px-1.5 py-1 rounded-lg border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-bold tracking-wider text-center text-xs shrink-0"
                />
              </div>

              {mobileOtpNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg text-[9.5px] font-medium flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{mobileOtpNotice}</span>
                </div>
              )}

              {isPhoneAlreadyRegistered && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center justify-between gap-1">
                  <span>⚠️ Already registered.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentity(signupPhone);
                      setAuthMethod('login');
                      setError(null);
                    }}
                    className="underline font-bold text-red-900 shrink-0 cursor-pointer"
                  >
                    Log In →
                  </button>
                </div>
              )}
            </div>

            {/* 2. Email Address & Email OTP via Resend in 1 tight card */}
            <div className="space-y-1 bg-surface-container-low p-2 rounded-xl border border-outline-variant/40">
              <div className="flex items-center justify-between text-[10.5px]">
                <label className="font-headline font-bold text-on-surface-variant flex items-center gap-1">
                  <Mail className="w-3 h-3 text-primary" /> Email Address (Resend) *
                </label>
                <span className="text-[9.5px] text-primary font-mono font-bold">Demo: 123456</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="email"
                  required
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-outline-variant focus:outline-none focus:border-primary bg-white font-medium text-xs"
                />
                <button
                  type="button"
                  disabled={isSendingEmailOtp || isEmailAlreadyRegistered}
                  onClick={handleSendSignupEmailOtp}
                  className="btn-secondary text-[10.5px] px-2 py-1 whitespace-nowrap font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {isSendingEmailOtp ? (
                    <div className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    emailOtpSent ? 'Resend' : 'Send'
                  )}
                </button>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={signupEmailOtp}
                  onChange={e => setSignupEmailOtp(e.target.value)}
                  placeholder="6-code"
                  className="w-18 px-1.5 py-1 rounded-lg border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-bold tracking-wider text-center text-xs shrink-0"
                />
              </div>

              {emailOtpNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg text-[9.5px] font-medium flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{emailOtpNotice}</span>
                </div>
              )}

              {isEmailAlreadyRegistered && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center justify-between gap-1">
                  <span>⚠️ Already registered.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentity(signupEmail);
                      setAuthMethod('login');
                      setError(null);
                    }}
                    className="underline font-bold text-red-900 shrink-0 cursor-pointer"
                  >
                    Log In →
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || isPhoneAlreadyRegistered || isEmailAlreadyRegistered}
              className={`w-full py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm mt-0.5 transition ${
                isPhoneAlreadyRegistered || isEmailAlreadyRegistered
                  ? 'bg-slate-300 text-slate-600 cursor-not-allowed opacity-80'
                  : 'btn-cta cursor-pointer'
              }`}
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPhoneAlreadyRegistered || isEmailAlreadyRegistered ? (
                <>⚠️ Registered (Log In Instead)</>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Verify Both OTPs & Register
                </>
              )}
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => { setAuthMethod('login'); setError(null); }}
                className="text-[11px] text-primary hover:underline font-headline font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                Already have an account? Log In <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        )}

        {/* OPTION 3: FORGOT PASSWORD (SMS OTP Verification & Reset) */}
        {authMethod === 'forgot_password' && (
          <form onSubmit={handleForgotSubmit} className="space-y-2 text-xs">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-2 text-primary text-[10.5px] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
              <p>Enter registered mobile to receive 4-digit SMS OTP to reset password.</p>
            </div>

            <div className="space-y-0.5">
              <label className="font-headline font-bold text-[10.5px] text-on-surface-variant flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-primary" /> Registered Mobile *
                </span>
                <span className="text-[9.5px] text-primary font-bold">10 Digits</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="tel"
                  required
                  value={forgotPhone}
                  onChange={e => setForgotPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-medium text-xs"
                />
                <button
                  type="button"
                  disabled={isSendingForgotOtp}
                  onClick={handleSendForgotOtp}
                  className="btn-secondary text-[10.5px] px-2.5 py-1 whitespace-nowrap font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {isSendingForgotOtp ? (
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    forgotOtpSent ? 'Resend' : 'Send OTP'
                  )}
                </button>
              </div>
            </div>

            {forgotOtpNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-1.5 rounded-xl text-[10px] font-medium flex items-center gap-1 animate-in fade-in">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{forgotOtpNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              <div className="space-y-0.5">
                <label className="font-headline font-bold text-[10px] text-on-surface-variant">
                  OTP (1234) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={forgotOtp}
                  onChange={e => setForgotOtp(e.target.value)}
                  placeholder="1234"
                  className="w-full px-2 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-bold tracking-widest text-center text-xs"
                />
              </div>

              <div className="space-y-0.5">
                <label className="font-headline font-bold text-[10px] text-on-surface-variant">
                  New Pass *
                </label>
                <input
                  type="password"
                  required
                  value={forgotNewPassword}
                  onChange={e => setForgotNewPassword(e.target.value)}
                  placeholder="Min 4"
                  className="w-full px-2 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-surface-container-lowest font-medium text-xs"
                />
              </div>

              <div className="space-y-0.5">
                <label className="font-headline font-bold text-[10px] text-on-surface-variant">
                  Confirm *
                </label>
                <input
                  type="password"
                  required
                  value={forgotConfirmPassword}
                  onChange={e => setForgotConfirmPassword(e.target.value)}
                  placeholder="Re-enter"
                  className="w-full px-2 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-surface-container-lowest font-medium text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-cta py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm mt-1 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Reset Password & Log In
                </>
              )}
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => { setAuthMethod('login'); setError(null); }}
                className="text-[11px] text-primary hover:underline font-headline font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" /> Back to Log In
              </button>
            </div>
          </form>
        )}

        {/* Demo Fast Fill Section - Compact 1-Row Pills */}
        <div className="pt-1.5 border-t border-outline-variant/30 flex items-center justify-between gap-1.5">
          <span className="text-[10px] font-headline font-bold text-on-surface-variant flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-secondary" /> Demo:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {authMethod === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('login');
                    handleQuickDemoLogin('9876543210', 'pass123');
                  }}
                  className="py-1 px-2 rounded-lg bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 font-semibold text-primary text-[10.5px] cursor-pointer whitespace-nowrap"
                >
                  👤 Rahul (9876543210)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('forgot_password');
                    setForgotPhone('9876543210');
                    setForgotOtp('1234');
                    setForgotOtpSent(true);
                    setForgotOtpNotice('Demo OTP: 1234');
                    setForgotNewPassword('pass123');
                    setForgotConfirmPassword('pass123');
                    setError(null);
                  }}
                  className="py-1 px-2 rounded-lg bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 font-semibold text-primary text-[10.5px] cursor-pointer whitespace-nowrap"
                >
                  🔑 Reset Demo
                </button>
              </>
            )}
            {authMethod === 'signup' && (
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('signup');
                  handleQuickDemoSignup();
                }}
                className="py-1 px-2.5 rounded-lg bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 font-semibold text-primary text-[10.5px] cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-primary" /> Auto-Fill Dual OTP Demo
              </button>
            )}
            {authMethod === 'forgot_password' && (
              <button
                type="button"
                onClick={() => {
                  setForgotPhone('9876543210');
                  setForgotOtp('1234');
                  setForgotOtpSent(true);
                  setForgotOtpNotice('Reset OTP sent via SMS. Demo code: 1234');
                  setForgotNewPassword('pass123');
                  setForgotConfirmPassword('pass123');
                  setError(null);
                }}
                className="py-1 px-2.5 rounded-lg bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 font-semibold text-primary text-[10.5px] cursor-pointer"
              >
                🔑 Auto-Fill Demo OTP & Pass
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
