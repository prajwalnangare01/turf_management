import { store } from './store';
import { Coupon } from '../types/schema';
import { AuditLogger } from './auditLogger';
import { getVenueDateString } from '../utils/venueTime';

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  discountAmount: number;
  message: string;
}

export class CouponService {
  /**
   * CC-S05: Validate promotional coupon against constraints:
   * - Existence & active state
   * - Expiry date boundary
   * - Minimum booking order amount
   * - Global usage limit capacity (used_count < usage_limit)
   */
  public static validateCoupon(
    code: string,
    orderAmount: number,
    customerId?: string
  ): CouponValidationResult {
    if (!code || !code.trim()) {
      return { valid: false, discountAmount: 0, message: 'Please enter a coupon code.' };
    }

    const cleanCode = code.trim().toUpperCase();
    const coupons = store.getCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);

    if (!coupon) {
      return { valid: false, discountAmount: 0, message: `Coupon code '${cleanCode}' is invalid.` };
    }

    // Expiry check
    const today = getVenueDateString(0);
    if (coupon.valid_to && coupon.valid_to < today) {
      return { valid: false, discountAmount: 0, message: `Coupon '${cleanCode}' expired on ${coupon.valid_to}.` };
    }
    if (coupon.valid_from && coupon.valid_from > today) {
      return { valid: false, discountAmount: 0, message: `Coupon '${cleanCode}' is not active yet (starts ${coupon.valid_from}).` };
    }

    // Minimum order amount check
    if (coupon.min_amount && orderAmount < coupon.min_amount) {
      return {
        valid: false,
        discountAmount: 0,
        message: `Minimum order value of ₹${coupon.min_amount} required to apply coupon '${cleanCode}'.`
      };
    }

    // CC-S05: Strict Concurrency Check on Usage Limit
    if (coupon.usage_limit !== undefined && coupon.used_count >= coupon.usage_limit) {
      return {
        valid: false,
        discountAmount: 0,
        message: `Coupon '${cleanCode}' usage limit exceeded! Only the first ${coupon.usage_limit} redemptions were allowed.`
      };
    }

    // Calculate discount
    const discount = coupon.discount_type === 'flat'
      ? Math.min(orderAmount, coupon.value)
      : Math.round((orderAmount * coupon.value) / 100);

    return {
      valid: true,
      coupon,
      discountAmount: discount,
      message: `Coupon '${cleanCode}' applied successfully! ₹${discount} savings.`
    };
  }

  /**
   * CC-S05: Atomic Coupon Redemption
   * Simulates PostgreSQL atomic query:
   * UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND used_count < usage_limit RETURNING *;
   * Fails if the limit was reached by a concurrent transaction.
   */
  public static atomicRedeem(couponId: string, bookingRef?: string): { success: boolean; message: string; coupon?: Coupon } {
    const coupons = store.getCoupons();
    const coupon = coupons.find(c => c.id === couponId);

    if (!coupon) {
      return { success: false, message: 'Coupon not found.' };
    }

    // Atomic limit check
    if (coupon.usage_limit !== undefined && coupon.used_count >= coupon.usage_limit) {
      return {
        success: false,
        message: `[Coupon Race Condition Guard] Coupon '${coupon.code}' usage limit (${coupon.usage_limit}) reached right before checkout completion.`
      };
    }

    // Atomic increment
    coupon.used_count = (coupon.used_count || 0) + 1;
    store.saveToStorage();

    AuditLogger.log(
      'SYSTEM',
      'COUPON_REDEEMED',
      'Coupon',
      coupon.id,
      { prior_used_count: coupon.used_count - 1 },
      { used_count: coupon.used_count, booking_ref: bookingRef }
    );

    return {
      success: true,
      message: `Coupon '${coupon.code}' redeemed successfully (Count: ${coupon.used_count}/${coupon.usage_limit}).`,
      coupon
    };
  }

  /**
   * Restore coupon usage count on cancellation or refund
   */
  public static releaseUsage(couponId: string): void {
    const coupons = store.getCoupons();
    const coupon = coupons.find(c => c.id === couponId);
    if (coupon && coupon.used_count > 0) {
      coupon.used_count = Math.max(0, coupon.used_count - 1);
      store.saveToStorage();
    }
  }
}
