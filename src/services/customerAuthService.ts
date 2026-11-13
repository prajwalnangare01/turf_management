import { Customer } from '../types/schema';
import { store } from './store';
import { normalizeIndianPhone } from '../utils/venueTime';
// Welcome email disabled per configuration
import { EmailVerificationService, RequestOtpResult } from './emailVerificationService';
import { SmsVerificationService, RequestSmsOtpResult } from './smsVerificationService';
import { SupabaseSyncService } from './supabaseSyncService';

const CUSTOMER_SESSION_KEY = 'turfflow_customer_session';

export interface CustomerSession {
  token: string;
  customer: Customer;
  authenticatedAt: string;
  expiresAt: number;
}

export class CustomerAuthService {
  /**
   * Send Signup Mobile OTP via SMS
   */
  public static async sendMobileSignupOtp(phone: string, name?: string): Promise<RequestSmsOtpResult> {
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }
    return SmsVerificationService.requestOtp(phone, 'signup', name);
  }

  /**
   * Synchronous / legacy helper for mobile OTP dispatch (calls SmsVerificationService async)
   */
  public static sendOtp(phone: string): { success: boolean; message: string; code?: string } {
    const normalizedPhone = normalizeIndianPhone(phone);
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    // Trigger async SMS request
    SmsVerificationService.requestOtp(phone, 'signup').catch(err => {
      console.warn('[CustomerAuthService] sendOtp error:', err);
    });

    const activeCode = SmsVerificationService.getActiveCode(phone, 'signup') || '1783';

    return {
      success: true,
      code: activeCode,
      message: `OTP sent via SMS to ${normalizedPhone}. Please check your phone messages.`
    };
  }

  /**
   * Check if phone number or email is already registered in the system.
   * Enforces 1 user per 1 unique phone number and 1 unique email.
   */
  public static checkIdentityExists(phone?: string, email?: string): {
    phoneExists: boolean;
    emailExists: boolean;
    existingCustomerByPhone?: Customer;
    existingCustomerByEmail?: Customer;
  } {
    const customers = store.getCustomers();
    const cleanDigits = phone ? phone.replace(/\D/g, '').slice(-10) : '';
    const normalizedPhone = phone ? normalizeIndianPhone(phone) : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    const existingCustomerByPhone = cleanDigits.length >= 10
      ? customers.find(c => 
          normalizeIndianPhone(c.phone) === normalizedPhone || 
          c.phone.replace(/\D/g, '').slice(-10) === cleanDigits
        )
      : undefined;

    const existingCustomerByEmail = (cleanEmail && cleanEmail.includes('@') && cleanEmail.includes('.'))
      ? customers.find(c => c.email && c.email.trim().toLowerCase() === cleanEmail)
      : undefined;

    return {
      phoneExists: !!existingCustomerByPhone,
      emailExists: !!existingCustomerByEmail,
      existingCustomerByPhone,
      existingCustomerByEmail
    };
  }

  /**
   * Request Password Reset OTP via SMS or Email
   */
  public static async sendPasswordResetOtp(identity: string): Promise<RequestSmsOtpResult | RequestOtpResult> {
    const cleanIdentity = identity.trim().toLowerCase();
    const normalizedPhone = normalizeIndianPhone(identity);
    const cleanDigits = identity.replace(/\D/g, '');
    const isEmail = cleanIdentity.includes('@') && cleanIdentity.includes('.');

    const customers = store.getCustomers();
    const customer = customers.find(c =>
      normalizeIndianPhone(c.phone) === normalizedPhone ||
      (cleanDigits.length >= 10 && c.phone.replace(/\D/g, '').slice(-10) === cleanDigits.slice(-10)) ||
      (c.email && c.email.toLowerCase() === cleanIdentity)
    );

    if (!customer) {
      return {
        success: false,
        message: 'No registered customer account found with this mobile number or email.'
      };
    }

    if (customer.is_blacklisted) {
      return {
        success: false,
        message: 'This account has been suspended. Please contact venue management.'
      };
    }

    if (isEmail && customer.email) {
      return EmailVerificationService.requestOtp(customer.email, 'forgot_password', customer.name);
    }

    return SmsVerificationService.requestOtp(customer.phone, 'forgot_password', customer.name);
  }

  /**
   * Reset Customer Password using SMS or Email OTP verification
   */
  public static resetPasswordWithOtp(
    identity: string,
    otpCode: string,
    newPassword: string
  ): { success: boolean; session?: CustomerSession; customer?: Customer; error?: string } {
    const cleanIdentity = identity.trim().toLowerCase();
    const cleanDigits = identity.replace(/\D/g, '');
    const normalizedPhone = normalizeIndianPhone(identity);
    const isEmail = cleanIdentity.includes('@') && cleanIdentity.includes('.');

    if (!cleanIdentity) {
      return { success: false, error: 'Please enter your registered mobile number or email.' };
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'New password must be at least 4 characters long.' };
    }

    const customers = store.getCustomers();
    const customer = customers.find(c =>
      normalizeIndianPhone(c.phone) === normalizedPhone ||
      (cleanDigits.length >= 10 && c.phone.replace(/\D/g, '').slice(-10) === cleanDigits.slice(-10)) ||
      (c.email && c.email.toLowerCase() === cleanIdentity)
    );

    if (!customer) {
      return { success: false, error: 'Customer account not found.' };
    }

    // Verify OTP: Check Email OTP first if 6 digits or email entered, otherwise SMS OTP (4 digits)
    let verifySuccess = false;
    let verifyError = 'Invalid verification code.';

    if (isEmail || (otpCode.trim().length === 6 && customer.email)) {
      const emailVerify = EmailVerificationService.verifyOtp(customer.email || cleanIdentity, otpCode, 'forgot_password');
      if (emailVerify.success) {
        verifySuccess = true;
      } else {
        verifyError = emailVerify.message;
      }
    }

    if (!verifySuccess) {
      const smsVerify = SmsVerificationService.verifyOtp(customer.phone, otpCode, 'forgot_password');
      if (smsVerify.success) {
        verifySuccess = true;
      } else if (!isEmail) {
        verifyError = smsVerify.message;
      }
    }

    if (!verifySuccess) {
      return { success: false, error: verifyError };
    }

    // Update password
    customer.password = newPassword.trim();
    store.setCustomers(customers);

    // Sync to Supabase PostgreSQL immediately
    SupabaseSyncService.syncCustomerToSupabase(customer).catch(err => {
      console.warn('[CustomerAuthService] Error syncing password reset to Supabase:', err);
    });

    console.info(`[CustomerAuthService] 🔑 Password reset successfully for customer ${customer.name} (${customer.phone})`);

    // Log the user in and return active session
    return this.createSession(customer);
  }

  /**
   * Login with phone/email and password
   */
  public static loginWithPassword(identity: string, password: string): { success: boolean; session?: CustomerSession; error?: string } {
    const cleanIdentity = identity.trim().toLowerCase();
    const normalizedPhone = normalizeIndianPhone(identity);
    const cleanDigits = identity.replace(/\D/g, '');

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const customers = store.getCustomers();
    let customer = customers.find(
      c => normalizeIndianPhone(c.phone) === normalizedPhone || 
           (cleanDigits.length >= 10 && c.phone.replace(/\D/g, '').slice(-10) === cleanDigits.slice(-10)) ||
           (c.email && c.email.toLowerCase() === cleanIdentity)
    );

    if (!customer) {
      return { 
        success: false, 
        error: 'No account found with this mobile number or email.' 
      };
    }

    if (customer.is_blacklisted) {
      return {
        success: false,
        error: 'Your account has been suspended due to no-show policy violations. Please contact venue admin.'
      };
    }

    // Validate password
    const expectedPassword = customer.password;
    if (expectedPassword) {
      if (password !== expectedPassword) {
        return { success: false, error: 'Incorrect password. Please try again or use Forgot Password.' };
      }
    } else {
      // Default demo password for initial mock accounts without password set
      if (password !== 'pass123') {
        return { success: false, error: 'Incorrect password. Please try again or use Forgot Password.' };
      }
    }

    return this.createSession(customer);
  }

  /**
   * Request Email Verification OTP for signup
   */
  public static async sendEmailSignupOtp(email: string, name?: string): Promise<RequestOtpResult> {
    const cleanEmail = email.trim().toLowerCase();
    return EmailVerificationService.requestOtp(cleanEmail, 'signup', name || 'Player');
  }

  /**
   * Update customer email with OTP verification
   */
  public static updateCustomerEmail(
    customerId: string,
    newEmail: string,
    otpCode: string
  ): { success: boolean; customer?: Customer; error?: string } {
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    const verifyRes = EmailVerificationService.verifyOtp(cleanEmail, otpCode, 'profile_update');
    if (!verifyRes.success) {
      return { success: false, error: verifyRes.message };
    }

    const customers = store.getCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
      return { success: false, error: 'Customer not found.' };
    }

    // Enforce 1 unique email per user across the entire platform
    const duplicateEmail = customers.find(c => c.id !== customerId && c.email && c.email.trim().toLowerCase() === cleanEmail);
    if (duplicateEmail) {
      return { success: false, error: 'This email address is already registered to another account. Each user must have a unique email.' };
    }

    customer.email = cleanEmail;
    customer.email_verified = true;
    store.setCustomers(customers);

    // Sync to Supabase PostgreSQL immediately
    SupabaseSyncService.syncCustomerToSupabase(customer).catch(err => {
      console.warn('[CustomerAuthService] Error syncing email update to Supabase:', err);
    });

    // Update active session in localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
        if (raw) {
          const session: CustomerSession = JSON.parse(raw);
          if (session.customer.id === customerId) {
            session.customer = customer;
            localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
          }
        }
      } catch {
        // Ignored
      }
    }

    return { success: true, customer };
  }

  /**
   * Register new customer account with required Dual OTP verification:
   * 1. 4-Digit Mobile OTP (SMS)
   * 2. 6-Digit Email OTP
   */
  public static register(
    name: string, 
    phone: string, 
    otp: string, 
    password: string, 
    email?: string,
    emailOtp?: string
  ): { success: boolean; session?: CustomerSession; error?: string } {
    const cleanDigits = phone.replace(/\D/g, '');
    const normalizedPhone = normalizeIndianPhone(phone);

    if (!name.trim()) {
      return { success: false, error: 'Full name is required for registration.' };
    }

    if (cleanDigits.length < 10) {
      return { success: false, error: 'Valid 10-digit mobile phone number is required.' };
    }

    // 1. Mobile Phone OTP Check (Mandatory via SMS)
    const cleanOtp = (otp || '').trim();
    if (!cleanOtp) {
      return { 
        success: false, 
        error: 'Mobile phone verification OTP is required.' 
      };
    }

    const mobileVerify = SmsVerificationService.verifyOtp(phone, cleanOtp, 'signup');
    if (!mobileVerify.success) {
      return { 
        success: false, 
        error: mobileVerify.message 
      };
    }

    // 2. Email Address Check (Mandatory)
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, error: 'Email address is mandatory for registration.' };
    }

    // 3. Email OTP Check (Mandatory)
    const cleanEmailOtp = (emailOtp || '').trim();
    if (!cleanEmailOtp) {
      return { success: false, error: '6-digit email verification code is mandatory.' };
    }

    const emailVerify = EmailVerificationService.verifyOtp(cleanEmail, cleanEmailOtp, 'signup');
    if (!emailVerify.success) {
      return { success: false, error: emailVerify.message };
    }

    // 4. Password Check
    if (!password || password.length < 4) {
      return { success: false, error: 'Please set a secure password with at least 4 characters.' };
    }

    // 5. Strict 1-to-1 Uniqueness Check: 1 user must have 1 unique phone number and 1 unique email
    const identityCheck = this.checkIdentityExists(phone, cleanEmail);

    if (identityCheck.phoneExists && identityCheck.emailExists) {
      return { 
        success: false, 
        error: 'An account with this mobile number and email already exists. Each user must have a unique number and email. Please select "Log In" to access your account.' 
      };
    }

    if (identityCheck.phoneExists) {
      return { 
        success: false, 
        error: 'An account with this mobile number already exists. Each user must have a unique phone number. Please select "Log In" to access your account.' 
      };
    }

    if (identityCheck.emailExists) {
      return { 
        success: false, 
        error: 'An account with this email address already exists. Each user must have a unique email address. Please select "Log In" to access your account.' 
      };
    }

    const newCustomer: Customer = {
      id: `cust-${Date.now().toString().substring(6)}`,
      name: name.trim(),
      phone: normalizedPhone,
      email: cleanEmail,
      email_verified: true,
      password: password.trim(),
      created_at: new Date().toISOString(),
      total_bookings: 0,
      total_spent: 0,
      no_show_count: 0,
      is_blacklisted: false
    };

    store.addCustomer(newCustomer);

    // Persist to Supabase PostgreSQL immediately
    SupabaseSyncService.syncCustomerToSupabase(newCustomer).catch(err => {
      console.warn('[CustomerAuthService] Error syncing new customer to Supabase:', err);
    });

    // Welcome email intentionally disabled






    return this.createSession(newCustomer);
  }

  /**
   * Helper to persist session token
   */
  private static createSession(customer: Customer): { success: boolean; session: CustomerSession } {
    const token = `cust_token_${customer.id}_${Date.now()}`;
    const session: CustomerSession = {
      token,
      customer,
      authenticatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days validity
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    }
    return { success: true, session };
  }

  /**
   * Read current authenticated customer
   */
  public static getAuthenticatedCustomer(): Customer | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
      if (!raw) return null;

      const session: CustomerSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        this.logout();
        return null;
      }

      const customers = store.getCustomers();
      const current = customers.find(c => c.id === session.customer.id);
      return current || session.customer;
    } catch {
      return null;
    }
  }

  /**
   * Logout customer
   */
  public static logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
  }
}
