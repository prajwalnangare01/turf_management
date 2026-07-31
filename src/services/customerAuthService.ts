import { Customer } from '../types/schema';
import { store } from './store';

const CUSTOMER_SESSION_KEY = 'turfflow_customer_session';

export interface CustomerSession {
  token: string;
  customer: Customer;
  authenticatedAt: string;
  expiresAt: number;
}

export class CustomerAuthService {
  /**
   * Send simulated OTP to phone number
   */
  public static sendOtp(phone: string): { success: boolean; message: string } {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    return {
      success: true,
      message: `OTP sent to +91 ${cleanPhone}. Demo verification code: 1234`
    };
  }

  /**
   * Login with phone and OTP
   */
  public static loginWithOtp(phone: string, otp: string): { success: boolean; session?: CustomerSession; error?: string } {
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (otp !== '1234' && otp.length !== 4) {
      return { success: false, error: 'Invalid OTP code. Use demo code: 1234' };
    }

    const customers = store.getCustomers();
    let customer = customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);

    if (!customer) {
      return { 
        success: false, 
        error: 'No account found with this phone number. Please register first.' 
      };
    }

    if (customer.is_blacklisted) {
      return {
        success: false,
        error: 'Your account has been suspended due to no-show policy violations. Please contact venue admin.'
      };
    }

    return this.createSession(customer);
  }

  /**
   * Login with phone/email and password
   */
  public static loginWithPassword(identity: string, password: string): { success: boolean; session?: CustomerSession; error?: string } {
    const cleanIdentity = identity.trim().toLowerCase();
    const cleanPhone = identity.replace(/\D/g, '');

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const customers = store.getCustomers();
    let customer = customers.find(
      c => c.phone.replace(/\D/g, '') === cleanPhone || (c.email && c.email.toLowerCase() === cleanIdentity)
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

    // Default demo password is 'pass123' if not explicitly set
    const expectedPassword = customer.password || 'pass123';
    if (password !== expectedPassword && password !== 'pass123') {
      return { success: false, error: 'Incorrect password. (Demo password: pass123)' };
    }

    return this.createSession(customer);
  }

  /**
   * Register new customer account with optional password
   */
  public static register(name: string, phone: string, email?: string, password?: string): { success: boolean; session?: CustomerSession; error?: string } {
    const cleanPhone = phone.replace(/\D/g, '');

    if (!name.trim()) {
      return { success: false, error: 'Name is required for registration.' };
    }

    if (cleanPhone.length < 10) {
      return { success: false, error: 'Valid 10-digit phone number is required.' };
    }

    const customers = store.getCustomers();
    let existing = customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);

    if (existing) {
      existing.name = name;
      if (email) existing.email = email;
      if (password) existing.password = password;
      store.saveToStorage();
      return this.createSession(existing);
    }

    const newCustomer: Customer = {
      id: `cust-${Date.now().toString().substring(6)}`,
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim(),
      password: password?.trim() || 'pass123',
      created_at: new Date().toISOString(),
      total_bookings: 0,
      total_spent: 0,
      no_show_count: 0,
      is_blacklisted: false
    };

    store.addCustomer(newCustomer);
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

    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    return { success: true, session };
  }

  /**
   * Read current authenticated customer
   */
  public static getAuthenticatedCustomer(): Customer | null {
    try {
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
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
  }
}
