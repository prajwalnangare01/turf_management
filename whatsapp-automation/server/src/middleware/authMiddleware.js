// Production JWT Authentication & Role-Based Access Control (RBAC) Middleware
import { ServerAuthService } from '../services/authService.js';

/**
 * Extract bearer token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

/**
 * Requires a valid authenticated JWT (admin or customer)
 */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing Bearer token.',
      code: 'AUTH_REQUIRED'
    });
  }

  try {
    const decoded = ServerAuthService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session token.',
      code: 'TOKEN_INVALID'
    });
  }
}

/**
 * Optional authentication: decodes JWT if present without blocking unauthenticated requests
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = ServerAuthService.verifyToken(token);
    } catch {
      // Ignore invalid optional tokens
    }
  }
  next();
}

/**
 * Requires authenticated user to be an Admin (any role: owner, manager, staff)
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Admin access required.',
        code: 'ADMIN_ACCESS_REQUIRED'
      });
    }
    next();
  });
}

/**
 * Requires admin to possess one of the authorized roles (e.g. ['owner', 'manager'])
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    requireAdmin(req, res, () => {
      const userRole = req.user?.role;
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Insufficient privileges. Required role: ${allowedRoles.join(' or ')}.`,
          code: 'INSUFFICIENT_ROLE'
        });
      }
      next();
    });
  };
}

/**
 * Requires authenticated customer or admin
 */
export function requireCustomer(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.type !== 'customer' && req.user?.type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customer access required.',
        code: 'CUSTOMER_ACCESS_REQUIRED'
      });
    }
    next();
  });
}
