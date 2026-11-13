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
    'rajupainter84688@gmail.com': 'admin123',
    'owner@turfflow.com': 'admin123',
    'manager@turfflow.com': 'manager123',
    'staff@turfflow.com': 'staff123',
    'owner@apexturf.com': 'admin123',
    'manager@apexturf.com': 'manager123',
    'staff@apexturf.com': 'staff123',
    'admin': 'admin123'
  };

  /**
   * Get Authorization headers containing backend-issued Bearer JWT
   */
  public static getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (session && session.token) {
      return { 'Authorization': `Bearer ${session.token}` };
    }
    return {};
  }

  /**
   * Attempt login with backend API (server-side bcrypt & signed JWT token)
   */
  public static async loginAsync(identity: string, password: string): Promise<{ success: boolean; session?: AdminSession; error?: string }> {
    try {
      const res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        const session: AdminSession = {
          token: data.token,
          adminUser: data.admin,
          authenticatedAt: new Date().toISOString(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        };
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
        return { success: true, session };
      }
      return { success: false, error: data.error || 'Admin authentication failed.' };
    } catch {
      // Offline fallback for unit tests or offline dev
      return this.login(identity, password);
    }
  }

  /**
   * Synchronous login helper (preserves backward compatibility and unit tests)
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

    // Try fetching real JWT asynchronously in background if browser environment
    if (typeof fetch !== 'undefined') {
      fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      }).then(r => r.json()).then(data => {
        if (data.token && typeof localStorage !== 'undefined') {
          const current = this.getSession();
          if (current) {
            current.token = data.token;
            localStorage.setItem(SESSION_KEY, JSON.stringify(current));
          }
        }
      }).catch(() => {});
    }

    // Create session token
    const token = `token_${admin.id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: AdminSession = {
      token,
      adminUser: admin,
      authenticatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return { success: true, session };
  }

  /**
   * Get active session if valid
   */
  public static getSession(): AdminSession | null {
    try {
      if (typeof localStorage === 'undefined') return null;
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
    }
  }
}
