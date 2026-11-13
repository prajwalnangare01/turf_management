// Express Rate Limiting Middleware for Security Hardening
import rateLimit from 'express-rate-limit';

/**
 * Strict rate limiter for Authentication endpoints (prevents brute force)
 * Max 15 attempts per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/**
 * Strict rate limiter for OTP & SMS/Email Dispatch (prevents SMS bombing)
 * Max 10 requests per 10 minutes
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many OTP or message dispatch requests. Please wait 10 minutes before retrying.',
    code: 'OTP_RATE_LIMIT_EXCEEDED'
  }
});

/**
 * Rate limiter for Slot Locks (prevents denial of service on court slots)
 * Max 30 holds per minute
 */
export const lockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many slot hold requests. Please slow down.',
    code: 'LOCK_RATE_LIMIT_EXCEEDED'
  }
});

/**
 * General API Rate Limiter
 * Max 500 requests per 15 minutes
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    code: 'API_RATE_LIMIT_EXCEEDED'
  }
});
