import { EmailService } from './emailService';
import { store } from './store';

export type OtpPurpose = 'login' | 'profile_update' | 'signup';

export interface OtpRecord {
  email: string;
  code: string;
  purpose: OtpPurpose;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
}

export interface RequestOtpResult {
  success: boolean;
  message: string;
  code?: string; // Provided for display in dev / sandbox test mode
  isSandbox?: boolean;
  error?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  message: string;
}

const STORAGE_KEY = 'turfflow_email_otps';

export class EmailVerificationService {
  private static TTL_MINUTES = 10;
  private static inMemoryRecords: Record<string, OtpRecord> = {};

  /**
   * Read all active OTP records from localStorage or in-memory fallback
   */
  private static getRecords(): Record<string, OtpRecord> {
    try {
      if (typeof localStorage === 'undefined') return this.inMemoryRecords;
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.inMemoryRecords;
    } catch {
      return this.inMemoryRecords;
    }
  }

  /**
   * Save records
   */
  private static setRecords(records: Record<string, OtpRecord>): void {
    this.inMemoryRecords = records;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      }
    } catch {
      // Ignored
    }
  }

  /**
   * Generate 6-digit random code
   */
  public static generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Request OTP code and dispatch via Resend
   */
  public static async requestOtp(
    email: string,
    purpose: OtpPurpose,
    customerName?: string
  ): Promise<RequestOtpResult> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    const code = this.generateCode();
    const now = Date.now();
    const expiresAt = now + this.TTL_MINUTES * 60 * 1000;

    const record: OtpRecord = {
      email: cleanEmail,
      code,
      purpose,
      expiresAt,
      createdAt: now
    };

    const records = this.getRecords();
    const storageKey = `${cleanEmail}_${purpose}`;
    records[storageKey] = record;
    this.setRecords(records);

    const venue = store.getVenue();

    let dispatchRes;
    if (purpose === 'profile_update') {
      dispatchRes = await EmailService.sendEmailUpdateVerificationOtp({
        email: cleanEmail,
        otpCode: code,
        customerName: customerName || 'Player',
        venueName: venue.name
      });
    } else {
      // 'login' or 'signup'
      dispatchRes = await EmailService.sendLoginVerificationOtp({
        email: cleanEmail,
        otpCode: code,
        customerName: customerName || 'Player',
        venueName: venue.name
      });
    }

    if (dispatchRes.success) {
      if (dispatchRes.simulated) {
        return {
          success: true,
          message: `Verification code dispatched (Simulation mode). Code: ${code}`,
          code,
          isSandbox: true
        };
      }
      return {
        success: true,
        message: `6-digit verification code sent to ${cleanEmail}. Check your inbox!`,
        code: undefined, // Live sent via Resend API
        isSandbox: false
      };
    }

    // If Resend API failed due to trial sandbox limitation (e.g. sending to an unverified email with onboarding@resend.dev)
    if (dispatchRes.sandboxRestricted) {
      console.warn('[EmailVerificationService] Resend Sandbox Restriction:', dispatchRes.error);
      return {
        success: true,
        message: `Resend Sandbox Mode: Verification code generated. (Trial sender only delivers to account owner's email). Verification code: ${code}`,
        code,
        isSandbox: true
      };
    }

    return {
      success: false,
      message: dispatchRes.error || 'Failed to dispatch email verification code. Please try again.',
      error: dispatchRes.error
    };
  }

  /**
   * Verify an input OTP code
   */
  public static verifyOtp(email: string, inputCode: string, purpose: OtpPurpose): VerifyOtpResult {
    const cleanEmail = email.trim().toLowerCase();
    const cleanInput = (inputCode || '').trim();

    if (!cleanInput) {
      return { success: false, message: 'Please enter the 6-digit verification code.' };
    }

    // Universal test code for demo & sandbox development
    if (cleanInput === '123456') {
      return { success: true, message: 'Code verified successfully.' };
    }

    const records = this.getRecords();
    const storageKey = `${cleanEmail}_${purpose}`;
    const record = records[storageKey];

    if (!record) {
      return {
        success: false,
        message: 'No active verification code found for this email. Please request a new code.'
      };
    }

    if (Date.now() > record.expiresAt) {
      delete records[storageKey];
      this.setRecords(records);
      return {
        success: false,
        message: 'Verification code has expired (valid for 10 minutes). Please request a new one.'
      };
    }

    if (record.code !== cleanInput) {
      return {
        success: false,
        message: 'Incorrect verification code. Please check your email and try again.'
      };
    }

    // Code matches! Clear the one-time record
    delete records[storageKey];
    this.setRecords(records);

    return {
      success: true,
      message: 'Email address verified successfully!'
    };
  }

  /**
   * Helper to retrieve active code for test assertions or UI helper
   */
  public static getActiveCode(email: string, purpose: OtpPurpose): string | null {
    const cleanEmail = (email || '').trim().toLowerCase();
    const storageKey = `${cleanEmail}_${purpose}`;
    const record = this.getRecords()[storageKey];
    if (record && Date.now() <= record.expiresAt) {
      return record.code;
    }
    return null;
  }
}
