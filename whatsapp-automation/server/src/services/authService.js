// Production Auth Service with bcrypt password hashing and signed JWT tokens
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { store } from '../data/store.js';
import { SupabaseService } from './supabaseService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'turfflow_production_jwt_secret_key_minimum_32_characters_long_123';
const JWT_EXPIRES_IN = '24h';

export class ServerAuthService {
  /**
   * Hash a plain password using bcrypt (10 rounds)
   */
  static hashPassword(password) {
    if (!password) return '';
    return bcrypt.hashSync(password, 10);
  }

  /**
   * Compare plain password with hash or legacy plaintext
   */
  static comparePassword(plainPassword, storedHashOrPlain) {
    if (!plainPassword || !storedHashOrPlain) return false;
    // Check if stored is a bcrypt hash ($2a$, $2b$, or $2y$)
    if (storedHashOrPlain.startsWith('$2')) {
      try {
        return bcrypt.compareSync(plainPassword, storedHashOrPlain);
      } catch {
        return false;
      }
    }
    // Backward compatibility for legacy pre-migration records
    return plainPassword === storedHashOrPlain;
  }

  /**
   * Issue signed JWT for an authenticated identity
   */
  static issueToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token) {
    if (!token) throw new Error('No token provided');
    return jwt.verify(token, JWT_SECRET);
  }

  /**
   * Authenticate Admin User (Owner / Manager / Staff)
   */
  static loginAdmin(identity, password) {
    const trimmedIdentity = (identity || '').trim().toLowerCase();
    if (!trimmedIdentity || !password) {
      return { success: false, error: 'Identity and password are required.' };
    }

    const adminUsers = store.getAdminUsers();
    let admin = adminUsers.find(
      a => (a.email && a.email.toLowerCase() === trimmedIdentity) || 
           (a.id && a.id.toLowerCase() === trimmedIdentity)
    );

    // Fallback username match
    if (!admin && trimmedIdentity === 'admin') {
      admin = adminUsers[0];
    }
    if (!admin) {
      admin = adminUsers.find(a => 
        (a.name && a.name.toLowerCase().includes(trimmedIdentity)) || 
        (a.role && a.role.toLowerCase() === trimmedIdentity)
      );
    }

    if (!admin) {
      return { success: false, error: 'Invalid admin credentials or account not found.' };
    }

    if (admin.is_active === false) {
      return { success: false, error: 'This admin account is currently deactivated.' };
    }

    // Role-based default credentials mapping if not hashed
    const roleDefaultPasswords = {
      owner: 'admin123',
      manager: 'manager123',
      staff: 'staff123'
    };
    const storedHash = admin.password_hash || admin.password || roleDefaultPasswords[admin.role] || 'admin123';

    const isValid = this.comparePassword(password, storedHash);
    if (!isValid) {
      return { success: false, error: 'Invalid password. Access denied.' };
    }

    // If password was stored in plaintext, upgrade it to bcrypt hash
    if (!storedHash.startsWith('$2')) {
      const newHash = this.hashPassword(password);
      admin.password_hash = newHash;
      SupabaseService.client?.from('admin_users')?.update({ password_hash: newHash })?.eq('id', admin.id).catch(() => {});
    }

    const tokenPayload = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      type: 'admin'
    };
    const token = this.issueToken(tokenPayload);

    return {
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        is_active: admin.is_active
      }
    };
  }

  /**
   * Authenticate Customer by phone or email + password
   */
  static loginCustomer(identity, password) {
    const cleanIdentity = (identity || '').trim().toLowerCase();
    const cleanDigits = cleanIdentity.replace(/\D/g, '').slice(-10);

    if (!cleanIdentity || !password) {
      return { success: false, error: 'Mobile/email and password are required.' };
    }

    const customers = store.getCustomers();
    const customer = customers.find(c => {
      const custClean = (c.phone || '').replace(/\D/g, '').slice(-10);
      return (cleanDigits && custClean === cleanDigits) ||
             (c.email && c.email.trim().toLowerCase() === cleanIdentity);
    });

    if (!customer) {
      return { success: false, error: 'No account found with this mobile number or email.' };
    }

    if (customer.is_blacklisted) {
      return { success: false, error: 'Your account is suspended due to no-show violations. Contact venue management.' };
    }

    const storedPass = customer.password;
    if (!storedPass) {
      return { success: false, error: 'No password set on this account. Please use OTP or Forgot Password.' };
    }

    const isValid = this.comparePassword(password, storedPass);
    if (!isValid) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    // Upgrade plaintext password to bcrypt if needed
    if (!storedPass.startsWith('$2')) {
      const newHash = this.hashPassword(password);
      customer.password = newHash;
      SupabaseService.client?.from('customers')?.update({ password: newHash })?.eq('id', customer.id).catch(() => {});
    }

    const tokenPayload = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      type: 'customer'
    };
    const token = this.issueToken(tokenPayload);

    return {
      success: true,
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        total_bookings: customer.total_bookings || 0,
        total_spent: customer.total_spent || 0,
        no_show_count: customer.no_show_count || 0
      }
    };
  }

  /**
   * Register new customer with bcrypt hashed password
   */
  static signupCustomer({ name, phone, email, password }) {
    if (!name || !phone || !password) {
      return { success: false, error: 'Name, mobile phone, and password are required.' };
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      return { success: false, error: 'Please enter a valid 10-digit phone number.' };
    }

    const customers = store.getCustomers();
    const existingPhone = customers.find(c => (c.phone || '').replace(/\D/g, '').slice(-10) === cleanPhone);
    if (existingPhone) {
      return { success: false, error: 'An account with this mobile number already exists. Please log in.' };
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = customers.find(c => c.email && c.email.trim().toLowerCase() === cleanEmail);
      if (existingEmail) {
        return { success: false, error: 'An account with this email address already exists.' };
      }
    }

    const hashedPassword = this.hashPassword(password);
    const newCustomer = {
      id: `cust-${Date.now()}`,
      name: name.trim(),
      phone: `+91${cleanPhone}`,
      email: email ? email.trim().toLowerCase() : undefined,
      password: hashedPassword,
      total_bookings: 0,
      total_spent: 0,
      no_show_count: 0,
      is_blacklisted: false,
      created_at: new Date().toISOString()
    };

    customers.push(newCustomer);
    store.setCustomers(customers);

    SupabaseService.client?.from('customers')?.upsert(newCustomer).catch(() => {});

    const tokenPayload = {
      id: newCustomer.id,
      name: newCustomer.name,
      phone: newCustomer.phone,
      email: newCustomer.email,
      type: 'customer'
    };
    const token = this.issueToken(tokenPayload);

    return {
      success: true,
      token,
      customer: {
        id: newCustomer.id,
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        total_bookings: 0,
        total_spent: 0
      }
    };
  }

  /**
   * Reset password for customer
   */
  static resetCustomerPassword(identity, newPassword) {
    if (!identity || !newPassword) {
      return { success: false, error: 'Identity and new password are required.' };
    }

    const cleanIdentity = identity.trim().toLowerCase();
    const cleanDigits = cleanIdentity.replace(/\D/g, '').slice(-10);

    const customers = store.getCustomers();
    const customer = customers.find(c => {
      const custClean = (c.phone || '').replace(/\D/g, '').slice(-10);
      return (cleanDigits && custClean === cleanDigits) ||
             (c.email && c.email.trim().toLowerCase() === cleanIdentity);
    });

    if (!customer) {
      return { success: false, error: 'Customer account not found.' };
    }

    customer.password = this.hashPassword(newPassword);
    store.setCustomers(customers);

    SupabaseService.client?.from('customers')?.update({ password: customer.password })?.eq('id', customer.id).catch(() => {});

    const token = this.issueToken({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      type: 'customer'
    });

    return {
      success: true,
      token,
      message: 'Password reset successfully.'
    };
  }
}
