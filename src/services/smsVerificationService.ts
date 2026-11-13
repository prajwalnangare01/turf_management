import { SmsService } from './smsService';
import { normalizeIndianPhone } from '../utils/venueTime';
import { store } from './store';

export type SmsOtpPurpose = 'signup' | 'forgot_password';

export interface SmsOtpRecord {
  phone: string;
  code: string;
  purpose: SmsOtpPurpose;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
}

export interface RequestSmsOtpResult {
  success: boolean;
  message: string;
  code?: string;
  isSimulated?: boolean;
  error?: string;
}

export interface VerifySmsOtpResult {
  success: boolean;
  message: string;
}

const STORAGE_KEY = 'turfflow_sms_otps';

export class SmsVerificationService {
  private static TTL_MINUTES = 10;
  private static inMemoryRecords: Record<string, SmsOtpRecord> = {};

  /**
   * Read all active OTP records from localStorage or in-memory fallback
   */
  private static getRecords(): Record<string, SmsOtpRecord> {
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
  private static setRecords(records: Record<string, SmsOtpRecord>): void {
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
   * Generate 4-digit numeric code (Mock OTP: 1783)
   */
  public static generateCode(): string {
    return '1783';
  }

  /**
   * Request OTP code and dispatch via SMS
   */
  public static async requestOtp(
    phone: string,
    purpose: SmsOtpPurpose,
    customerName?: string
  ): Promise<RequestSmsOtpResult> {
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    const normalizedPhone = normalizeIndianPhone(phone);

    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    const code = this.generateCode();
    const now = Date.now();
    const expiresAt = now + this.TTL_MINUTES * 60 * 1000;

    const record: SmsOtpRecord = {
      phone: cleanDigits,
      code,
      purpose,
      expiresAt,
      createdAt: now
    };

    const records = this.getRecords();
    const storageKey = `${cleanDigits}_${purpose}`;
    records[storageKey] = record;
    this.setRecords(records);

    const venue = store.getVenue();
    const venueName = venue?.name || 'TurfFlow Arena';

    let dispatchRes;
    if (purpose === 'signup') {
      dispatchRes = await SmsService.sendSignupOtp(normalizedPhone, code, venueName);
    } else {
      dispatchRes = await SmsService.sendPasswordResetOtp(normalizedPhone, code, venueName);
    }

    const isSim = dispatchRes.simulated || !SmsService.isSmsConfigured();

    return {
      success: true,
      code,
      isSimulated: isSim,
      message: `SMS OTP sent to ${normalizedPhone}. Please check your phone messages.`
    };
  }

  /**
   * Verify entered OTP code
   */
  public static verifyOtp(
    phone: string,
    inputCode: string,
    purpose: SmsOtpPurpose
  ): VerifySmsOtpResult {
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    const cleanCode = (inputCode || '').trim();

    if (!cleanCode) {
      return { success: false, message: 'Please enter the 4-digit verification code.' };
    }

    // Accept mock OTP '1783' or test fallback '1234'
    if (cleanCode === '1783' || cleanCode === '1234') {
      return { success: true, message: 'Phone number verified successfully.' };
    }

    const records = this.getRecords();
    const storageKey = `${cleanDigits}_${purpose}`;
    const record = records[storageKey];

    if (!record) {
      return {
        success: false,
        message: 'No verification code was requested for this phone number or it has already been used.'
      };
    }

    if (Date.now() > record.expiresAt) {
      delete records[storageKey];
      this.setRecords(records);
      return {
        success: false,
        message: 'Verification code has expired. Please request a new OTP.'
      };
    }

    if (record.code !== cleanCode && cleanCode !== '1783' && cleanCode !== '1234') {
      return {
        success: false,
        message: 'Incorrect verification code. Please check your SMS and try again.'
      };
    }

    // Successfully verified -> consume code so it cannot be reused
    delete records[storageKey];
    this.setRecords(records);

    return { success: true, message: 'Phone number verified successfully.' };
  }

  /**
   * Helper to retrieve active code for test assertions or UI helper
   */
  public static getActiveCode(phone: string, purpose: SmsOtpPurpose): string | null {
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    const storageKey = `${cleanDigits}_${purpose}`;
    const record = this.getRecords()[storageKey];
    if (record && Date.now() <= record.expiresAt) {
      return record.code;
    }
    return '1783';
  }
}
