import { AdminUser } from '../types/schema';
import { store } from './store';

const SESSION_KEY = 'turfflow_admin_session';

export interface AdminSession {
  token: string;
  adminUser: AdminUser;
  authenticatedAt: string;
  expiresAt: number;
}

export class AuthService {
  // Pre-configured admin passwords mapped by email
  private static ADMIN_CREDENTIALS: Record<string, string> = {
    'owner@apexturf.com': 'admin123',
    'manager@apexturf.com': 'manager123',
    'staff@apexturf.com': 'staff123',
    'admin': 'admin123'
  };

  /**
   * Attempt login with email/username and password
   */
  public static login(identity: string, password: string): { success: boolean; session?: AdminSession; error?: string } {
    const trimmedIdentity = identity.trim().toLowerCase();

    // Check credentials matching
    const expectedPassword = this.ADMIN_CREDENTIALS[trimmedIdentity] || 'admin123';
    
    // Find admin user in store
    const adminUsers = store.getAdminUsers();
    let admin = adminUsers.find(
      a => a.email.toLowerCase() === trimmedIdentity || a.id.toLowerCase() === trimmedIdentity
    );

    // Default fallback to first admin if username is 'admin' or matching role
    if (!admin && trimmedIdentity === 'admin') {
      admin = adminUsers[0];
    }

    if (!admin) {
      // Check if identity contains role hint or matches name
      admin = adminUsers.find(a => a.name.toLowerCase().includes(trimmedIdentity) || a.role.toLowerCase() === trimmedIdentity);
    }

    if (!admin) {
      return { success: false, error: 'Invalid admin identity or user not found.' };
    }

    if (password !== expectedPassword) {
      return { success: false, error: 'Invalid password. (Default passwords: admin123, manager123, staff123)' };
    }

    if (!admin.is_active) {
      return { success: false, error: 'This admin account is currently deactivated.' };
    }

    // Create session token
    const token = `token_${admin.id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: AdminSession = {
      token,
      adminUser: admin,
      authenticatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, session };
  }

  /**
   * Get active session if valid
   */
  public static getSession(): AdminSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const session: AdminSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        this.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Get currently authenticated admin user
   */
  public static getAuthenticatedAdmin(): AdminUser | null {
    const session = this.getSession();
    return session ? session.adminUser : null;
  }

  /**
   * Logout active session
   */
  public static logout(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}
