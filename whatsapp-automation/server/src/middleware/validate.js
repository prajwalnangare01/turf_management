// Zod Request Validation Middleware for API Hardening
import { z } from 'zod';

/**
 * Higher-order middleware to validate req.body against a Zod schema
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorDetails = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return res.status(400).json({
        success: false,
        error: `Validation error: ${errorDetails}`,
        code: 'VALIDATION_FAILED',
        details: result.error.format()
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

// Schemas
export const adminLoginSchema = z.object({
  identity: z.string().min(1, 'Identity is required'),
  password: z.string().min(1, 'Password is required')
});

export const customerLoginSchema = z.object({
  identity: z.string().min(1, 'Mobile or email identity is required'),
  password: z.string().min(1, 'Password is required')
});

export const customerSignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Valid 10-digit mobile number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  mobileTicket: z.string().optional(),
  emailTicket: z.string().optional()
});

export const passwordResetSchema = z.object({
  identity: z.string().min(1, 'Identity is required'),
  newPassword: z.string().min(4, 'New password must be at least 4 characters'),
  ticket: z.string().optional()
});

export const otpRequestSchema = z.object({
  target: z.string().min(3, 'Target email or phone is required'),
  channel: z.enum(['email', 'sms']),
  purpose: z.string().optional().default('signup'),
  name: z.string().optional()
});

export const otpVerifySchema = z.object({
  target: z.string().min(3, 'Target email or phone is required'),
  code: z.string().min(4, 'Verification code is required'),
  purpose: z.string().optional().default('signup')
});

export const slotLockSchema = z.object({
  courtId: z.string().min(1, 'Court ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime: z.string().min(4, 'Start time is required'),
  lockedBy: z.string().min(1, 'Session or phone identifier required'),
  ttlSeconds: z.number().optional().default(300)
});

export const createPaymentOrderSchema = z.object({
  bookingRef: z.string().min(1, 'Booking reference is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().optional().default('INR')
});

export const verifyPaymentSchema = z.object({
  bookingRef: z.string().min(1, 'Booking reference is required'),
  razorpay_order_id: z.string().min(1, 'Razorpay order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Razorpay payment ID is required'),
  razorpay_signature: z.string().min(1, 'Razorpay signature is required')
});
