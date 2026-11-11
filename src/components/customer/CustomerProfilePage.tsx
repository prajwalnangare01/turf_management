import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Customer, Booking } from '../../types/schema';
import { formatTimeRange12h, formatTime12hPlain, formatTimeRange12hPlain, formatDateDDMMYYYY, formatPhoneNumber, getBookingGatePassOtp, getBookingGroupRef } from '../../utils/formatters';
import { TimeOfDayIcon } from '../common/TimeOfDayIcon';
import { CancelBookingConfirmModal } from './CancelBookingConfirmModal';
import { 
  User, Phone, Mail, Calendar, ArrowLeft, ShieldCheck, Ticket, 
  XCircle, CheckCircle2, Clock, Award, LogOut, Edit2, Save, X, KeyRound, RotateCcw,
  Download, Printer, AlertCircle, Sparkles, Trophy, CreditCard, Tag, AlertTriangle, FileDown,
  Sun, Moon, MapPin, Layers, CloudRain, QrCode, ExternalLink, Send
} from 'lucide-react';
import { EmailVerificationService } from '../../services/emailVerificationService';
import { CustomerAuthService } from '../../services/customerAuthService';
import { SupabaseSyncService } from '../../services/supabaseSyncService';

interface CustomerProfilePageProps {
  currentCustomer: Customer;
  onBackToBooking: () => void;
  onLogout: () => void;
  onUpdateCustomer: (updated: Customer) => void;
  onNavigateToPolicies?: (section?: any) => void;
}

export const CustomerProfilePage: React.FC<CustomerProfilePageProps> = ({
  currentCustomer,
  onBackToBooking,
  onLogout,
  onUpdateCustomer,
  onNavigateToPolicies
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [nameInput, setNameInput] = useState(currentCustomer.name);
  const [emailInput, setEmailInput] = useState('');
  const [isUpdatingEmailInEdit, setIsUpdatingEmailInEdit] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');

  // Email verification modal states (Resend OTP)
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpNotice, setEmailOtpNotice] = useState<string | null>(null);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);
  const [isConfirmingEmailOtp, setIsConfirmingEmailOtp] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  // Validation for updating email (Old vs New Email comparison & Duplicate registration check)
  const validateEmailUpdate = (newEmail: string, oldEmail?: string, currentCustId?: string) => {
    const cleanNew = newEmail.trim().toLowerCase();
    const cleanOld = (oldEmail || '').trim().toLowerCase();

    if (!cleanNew) {
      return { isConflict: false, warning: null, isValid: false };
    }

    // 1. Both old and new should not be the same
    if (cleanOld && cleanNew === cleanOld) {
      return {
        isConflict: true,
        warning: 'New email cannot be the same as your old email.',
        isValid: false
      };
    }

    // 2. Format check
    const isValidFormat = cleanNew.includes('@') && cleanNew.includes('.') && cleanNew.length >= 5;
    if (!isValidFormat) {
      return {
        isConflict: false,
        warning: null,
        isValid: false
      };
    }

    // 3. New email should not already be registered to another account
    const customers = store.getCustomers();
    const duplicateCustomer = customers.find(
      c => c.id !== currentCustId && c.email && c.email.trim().toLowerCase() === cleanNew
    );

    if (duplicateCustomer) {
      return {
        isConflict: true,
        warning: 'This email is already registered with another account.',
        isValid: false
      };
    }

    return {
      isConflict: false,
      warning: null,
      isValid: true
    };
  };

  const editEmailValidation = validateEmailUpdate(newEmailInput, currentCustomer.email, currentCustomer.id);
  const modalEmailValidation = validateEmailUpdate(emailInput, currentCustomer.email, currentCustomer.id);

  useEffect(() => {
    const timer = setInterval(() => {
      setEmailCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const openEmailUpdateModal = () => {
    setEmailInput('');
    setEmailOtpCode('');
    setEmailOtpSent(false);
    setEmailOtpError(null);
    setEmailOtpNotice(null);
    setIsVerifyingEmail(true);
  };

  // Selected booking for Entry Pass Modal
  const [passModalBooking, setPassModalBooking] = useState<Booking | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [passLocationQrDataUrl, setPassLocationQrDataUrl] = useState<string>('');
  const venue = store.getVenue();
  const venueLocationUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;

  useEffect(() => {
    QRCode.toDataURL(venueLocationUrl, { margin: 1, width: 160 })
      .then(url => setPassLocationQrDataUrl(url))
      .catch(() => setPassLocationQrDataUrl(''));
  }, [venueLocationUrl]);
  // Selected booking for Cancellation & Refund Confirmation Popup
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);

  // Get customer's bookings from store (match by ID or Phone number)
  const currentDigits = currentCustomer.phone.replace(/\D/g, '').slice(-10);
  const customerIds = new Set(
    store.getCustomers().filter(c => 
      c.id === currentCustomer.id || 
      (currentDigits && c.phone.replace(/\D/g, '').slice(-10) === currentDigits)
    ).map(c => c.id)
  );
  customerIds.add(currentCustomer.id);

  // Helper to sort bookings by latest date & time first
  const sortBookingsDesc = (list: Booking[]) => {
    return [...list].sort((a, b) => {
      const timeA = new Date(`${a.booking_date}T${a.start_time}:00`).getTime() || 0;
      const timeB = new Date(`${b.booking_date}T${b.start_time}:00`).getTime() || 0;
      return timeB - timeA;
    });
  };

  const [bookingsList, setBookingsList] = useState<Booking[]>(() => 
    sortBookingsDesc(store.getBookings().filter(b => customerIds.has(b.customer_id)))
  );

  // Subscribe to real-time store changes (e.g. cancellation, new booking, updates)
  useEffect(() => {
    const refresh = () => {
      const allB = store.getBookings();
      setBookingsList(sortBookingsDesc(allB.filter(b => customerIds.has(b.customer_id))));
    };
    const unsubscribe = store.subscribe(refresh);
    return () => unsubscribe();
  }, [currentCustomer.id, currentDigits]);

  const courts = store.getCourts();
  const sports = store.getSports();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  // Local YYYY-MM-DD string
  const todayStr = `${year}-${month}-${day}`;
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // User Mode Site: Show last 30 days data only for past matches & cancelled bookings (lightweight customer experience)
  const thirtyDaysAgoDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = `${thirtyDaysAgoDate.getFullYear()}-${String(thirtyDaysAgoDate.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgoDate.getDate()).padStart(2, '0')}`;

  // Categorize bookings
  const upcomingBookings = bookingsList.filter(b => {
    if (b.status === 'cancelled' || b.status === 'refunded' || b.status === 'completed') return false;
    if (b.booking_date > todayStr) return true;
    if (b.booking_date === todayStr) {
      const [endH, endM] = (b.end_time || '23:59').split(':').map(Number);
      return (endH * 60 + (endM || 0)) > currentMins;
    }
    return false;
  });

  const completedBookings = bookingsList.filter(b => {
    if (b.status === 'cancelled' || b.status === 'refunded') return false;
    // Constrain past matches to last 30 days
    if (b.booking_date < thirtyDaysAgoStr) return false;
    if (b.status === 'completed') return true;
    if (b.booking_date < todayStr) return true;
    if (b.booking_date === todayStr) {
      const [endH, endM] = (b.end_time || '23:59').split(':').map(Number);
      return (endH * 60 + (endM || 0)) <= currentMins;
    }
    return false;
  });

  const cancelledBookings = bookingsList.filter(b => {
    if (b.status !== 'cancelled' && b.status !== 'refunded') return false;
    // Constrain cancelled bookings to last 30 days
    return b.booking_date >= thirtyDaysAgoStr;
  });

  const displayedBookings = 
    activeTab === 'all' ? bookingsList :
    activeTab === 'upcoming' ? upcomingBookings :
    activeTab === 'completed' ? completedBookings :
    cancelledBookings;

  const calculateRefund = (booking: Booking) => {
    const bookingTimeStr = `${booking.booking_date}T${booking.start_time}:00`;
    const bookingDate = new Date(bookingTimeStr);
    const diffHours = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const policies = store.getCancellationPolicies().sort((a, b) => b.hours_before_start - a.hours_before_start);
    let refundPct = 0;

    for (const p of policies) {
      if (diffHours >= p.hours_before_start) {
        refundPct = p.refund_percentage;
        break;
      }
    }

    const refundAmount = Math.round((booking.total_amount * refundPct) / 100);
    return { diffHours, refundPct, refundAmount };
  };

  const handleCancelBooking = (booking: Booking) => {
    // Open dedicated Cancellation & Refund Breakdown Modal instead of window.confirm
    setCancelModalBooking(booking);
  };

  const handleExecuteCancellation = (
    refundAmount: number, 
    refundReason: string, 
    metTerms: boolean, 
    noticeHours: number
  ) => {
    if (!cancelModalBooking) return { success: false, message: 'No reservation selected' };
    const targetBooking = cancelModalBooking;
    const nextStatus: 'refunded' | 'cancelled' = refundAmount > 0 ? 'refunded' : 'cancelled';

    const result = PostgresEngine.updateBookingStatus(targetBooking.id, nextStatus, {
      refundAmount,
      refundReason,
      cancelledBy: 'customer',
      noticeHours,
      metTerms
    });

    if (result.success) {
      setBookingsList(prev => {
        const groupRef = getBookingGroupRef(targetBooking);
        const updated = prev.map(b => b.id === targetBooking.id ? { 
          ...b, 
          status: nextStatus,
          refund_amount: refundAmount,
          refund_reason: refundReason,
          cancelled_by: 'customer' as const,
          cancellation_notice_hours: noticeHours,
          cancellation_met_terms: metTerms,
          all_slots: [{ start_time: b.start_time, end_time: b.end_time, price: b.total_amount }],
          formatted_slots: formatTimeRange12hPlain(b.start_time, b.end_time),
          total_order_amount: b.total_amount
        } : b);

        const activeSiblings = updated.filter(b => 
          b.id !== targetBooking.id &&
          b.status !== 'cancelled' && b.status !== 'refunded' &&
          (getBookingGroupRef(b) === groupRef || b.group_ref === groupRef || (targetBooking.gateway_payment_id && b.gateway_payment_id === targetBooking.gateway_payment_id))
        );

        const activeSlots = activeSiblings.map(s => ({
          start_time: s.start_time,
          end_time: s.end_time,
          price: s.total_amount
        })).sort((a, b) => a.start_time.localeCompare(b.start_time));

        const activeGrandTotal = activeSiblings.reduce((sum, s) => sum + (s.total_amount || 0), 0);
        const activeFormattedSlots = activeSlots.map(s => formatTimeRange12hPlain(s.start_time, s.end_time)).join(', ');

        return updated.map(b => {
          if (activeSiblings.some(s => s.id === b.id)) {
            return {
              ...b,
              all_slots: activeSlots,
              total_order_amount: activeGrandTotal,
              formatted_slots: activeFormattedSlots
            };
          }
          return b;
        });
      });
      return { success: true };
    } else {
      return { success: false, message: result.message };
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    // If customer is updating email in edit form
    if (isUpdatingEmailInEdit && newEmailInput.trim()) {
      if (editEmailValidation.warning) {
        alert(editEmailValidation.warning);
        return;
      }
      if (!emailOtpSent) {
        alert('Please click "Send Verification Code" and verify your new email address with OTP before saving.');
        return;
      }
      alert('Please enter the 6-digit verification code to complete your email update.');
      return;
    }

    // Only name changed
    const updated = {
      ...currentCustomer,
      name: nameInput.trim()
    };

    const customers = store.getCustomers();
    const idx = customers.findIndex(c => c.id === currentCustomer.id);
    if (idx !== -1) {
      customers[idx] = updated;
      store.setCustomers(customers);
      SupabaseSyncService.syncCustomerToSupabase(updated).catch(err => {
        console.warn('[CustomerProfilePage] Error syncing updated profile to Supabase:', err);
      });
    }

    onUpdateCustomer(updated);
    setIsEditing(false);
    setIsUpdatingEmailInEdit(false);
    alert('Profile details updated successfully!');
  };

  const handleSendEmailOtpForEditUpdate = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanNewEmail = newEmailInput.trim().toLowerCase();
    const validation = validateEmailUpdate(cleanNewEmail, currentCustomer.email, currentCustomer.id);
    if (validation.warning) {
      setEmailOtpError(validation.warning);
      return;
    }
    if (!validation.isValid) {
      setEmailOtpError('Please enter a valid email address.');
      return;
    }

    setIsSendingEmailOtp(true);
    setEmailOtpError(null);
    setEmailOtpNotice(null);

    try {
      const res = await EmailVerificationService.requestOtp(cleanNewEmail, 'profile_update', nameInput.trim() || currentCustomer.name);
      setIsSendingEmailOtp(false);

      if (res.success) {
        setEmailOtpSent(true);
        setEmailCooldown(30);
        setEmailOtpNotice(res.isSandbox 
          ? `📧 Resend Sandbox Code: ${res.code} (Free Resend tier delivers to prajwalnangare41@gmail.com)` 
          : `6-digit verification code sent to ${cleanNewEmail}. Check your inbox!`);
      } else {
        setEmailOtpError(res.message || 'Could not send verification email via Resend.');
      }
    } catch (err: any) {
      setIsSendingEmailOtp(false);
      setEmailOtpError(err?.message || 'Error communicating with Resend email service.');
    }
  };

  const handleConfirmEmailOtpForEdit = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEmailOtpError(null);
    if (!emailOtpCode.trim()) {
      setEmailOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setIsConfirmingEmailOtp(true);
    const cleanNewEmail = newEmailInput.trim().toLowerCase();
    const result = CustomerAuthService.updateCustomerEmail(currentCustomer.id, cleanNewEmail, emailOtpCode);
    setIsConfirmingEmailOtp(false);

    if (result.success && result.customer) {
      const finalCustomer: Customer = {
        ...result.customer,
        name: nameInput.trim() || currentCustomer.name,
        email_verified: true
      };

      const customers = store.getCustomers();
      const idx = customers.findIndex(c => c.id === finalCustomer.id);
      if (idx !== -1) {
        customers[idx] = finalCustomer;
        store.setCustomers(customers);
        SupabaseSyncService.syncCustomerToSupabase(finalCustomer).catch(err => {
          console.warn('[CustomerProfilePage] Error syncing confirmed email to Supabase:', err);
        });
      }

      onUpdateCustomer(finalCustomer);
      setIsUpdatingEmailInEdit(false);
      setNewEmailInput('');
      setEmailOtpCode('');
      setEmailOtpNotice(null);
      setEmailOtpSent(false);
      alert('Email address verified via Resend and profile updated successfully!');
    } else {
      setEmailOtpError(result.error || 'Verification failed. Please check the code.');
    }
  };

  const handleResendEmailOtpForEdit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanNewEmail = newEmailInput.trim().toLowerCase();
    if (!cleanNewEmail) return;

    setIsSendingEmailOtp(true);
    setEmailOtpError(null);
    const res = await EmailVerificationService.requestOtp(cleanNewEmail, 'profile_update', nameInput.trim() || currentCustomer.name);
    setIsSendingEmailOtp(false);

    if (res.success) {
      setEmailCooldown(30);
      setEmailOtpNotice(res.isSandbox 
        ? `New verification code dispatched (Resend Sandbox mode).` 
        : `New 6-digit code sent to ${cleanNewEmail}.`);
    } else {
      setEmailOtpError(res.message || 'Could not resend email verification code.');
    }
  };

  const handleSendEmailOtpForUpdate = async () => {
    const cleanNewEmail = emailInput.trim().toLowerCase();
    const validation = validateEmailUpdate(cleanNewEmail, currentCustomer.email, currentCustomer.id);
    if (validation.warning) {
      setEmailOtpError(validation.warning);
      return;
    }
    if (!validation.isValid) {
      setEmailOtpError('Please enter a valid email address.');
      return;
    }

    setIsSendingEmailOtp(true);
    setEmailOtpError(null);
    setEmailOtpNotice(null);

    try {
      const res = await EmailVerificationService.requestOtp(cleanNewEmail, 'profile_update', currentCustomer.name);
      setIsSendingEmailOtp(false);

      if (res.success) {
        setEmailOtpSent(true);
        setEmailCooldown(30);
        setEmailOtpNotice(res.isSandbox 
          ? `📧 Resend Sandbox Code: ${res.code} (Free Resend tier delivers to prajwalnangare41@gmail.com)` 
          : `6-digit verification code sent to ${cleanNewEmail}. Check your inbox!`);
      } else {
        setEmailOtpError(res.message || 'Could not send verification email via Resend.');
      }
    } catch (err: any) {
      setIsSendingEmailOtp(false);
      setEmailOtpError(err?.message || 'Error communicating with Resend email service.');
    }
  };

  const handleConfirmEmailOtp = () => {
    setEmailOtpError(null);
    if (!emailOtpCode.trim()) {
      setEmailOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setIsConfirmingEmailOtp(true);
    const cleanNewEmail = emailInput.trim().toLowerCase();
    const result = CustomerAuthService.updateCustomerEmail(currentCustomer.id, cleanNewEmail, emailOtpCode);
    setIsConfirmingEmailOtp(false);

    if (result.success && result.customer) {
      const finalCustomer: Customer = {
        ...result.customer,
        name: nameInput.trim() || currentCustomer.name,
        email_verified: true
      };

      const customers = store.getCustomers();
      const idx = customers.findIndex(c => c.id === finalCustomer.id);
      if (idx !== -1) {
        customers[idx] = finalCustomer;
        store.setCustomers(customers);
        SupabaseSyncService.syncCustomerToSupabase(finalCustomer).catch(err => {
          console.warn('[CustomerProfilePage] Error syncing confirmed email to Supabase:', err);
        });
      }

      onUpdateCustomer(finalCustomer);
      setIsVerifyingEmail(false);
      setIsEditing(false);
      setIsUpdatingEmailInEdit(false);
      setNewEmailInput('');
      setEmailOtpCode('');
      setEmailOtpNotice(null);
      setEmailOtpSent(false);
      alert('Email address verified via Resend and profile updated successfully!');
    } else {
      setEmailOtpError(result.error || 'Verification failed. Please check the code.');
    }
  };

  const handleResendEmailOtp = async () => {
    const cleanNewEmail = emailInput.trim().toLowerCase();
    if (!cleanNewEmail) return;

    setIsSendingEmailOtp(true);
    setEmailOtpError(null);
    const res = await EmailVerificationService.requestOtp(cleanNewEmail, 'profile_update', nameInput.trim());
    setIsSendingEmailOtp(false);

    if (res.success) {
      setEmailCooldown(30);
      setEmailOtpNotice(res.isSandbox 
        ? `New verification code dispatched (Resend Sandbox mode).` 
        : `New 6-digit code sent to ${cleanNewEmail}.`);
    } else {
      setEmailOtpError(res.message || 'Could not resend email verification code.');
    }
  };

  const handleDownloadPdf = async (booking: Booking) => {
    setIsDownloadingPdf(true);
    try {
      const allBookings = store.getBookings();
      const groupRef = getBookingGroupRef(booking);
      const siblingBookings = allBookings.filter(b => 
        getBookingGroupRef(b) === groupRef ||
        (b.group_ref && b.group_ref === groupRef) || 
        b.booking_ref === groupRef || 
        (booking.gateway_payment_id && booking.gateway_payment_id !== '' && b.gateway_payment_id === booking.gateway_payment_id)
      );
      const isActiveBooking = booking.status !== 'cancelled' && booking.status !== 'refunded';
      const validSiblings = isActiveBooking
        ? siblingBookings.filter(b => b.status !== 'cancelled' && b.status !== 'refunded')
        : siblingBookings.filter(b => b.id === booking.id);

      const allSlots = Array.from(new Map(validSiblings.map(b => [`${b.start_time}-${b.end_time}`, {
        start_time: b.start_time,
        end_time: b.end_time,
        price: b.total_amount
      }])).values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

      const grandTotal = validSiblings.length > 0 
        ? validSiblings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
        : booking.total_amount;

      const formattedSlots = allSlots.map(s => formatTimeRange12hPlain(s.start_time, s.end_time)).join(', ');
      const otpCode = getBookingGatePassOtp(booking);
      const court = courts.find(c => c.id === booking.court_id);

      const fullPayload = {
        ...booking,
        booking_ref: groupRef,
        group_ref: groupRef,
        court_name: court?.name || 'Turf Pitch',
        sport_name: court?.sport_ids?.join(' / ') || 'Football',
        customer_name: currentCustomer.name,
        customer_phone: currentCustomer.phone,
        gate_pass_otp: otpCode,
        total_amount: grandTotal,
        total_order_amount: grandTotal,
        all_slots: allSlots,
        formatted_slots: formattedSlots
      };

      // 1. Try POST /api/bookings/generate-pass-pdf with complete multi-slot payload
      let res = await fetch('/api/bookings/generate-pass-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: fullPayload })
      });

      // 2. Fallback to GET endpoint
      if (!res.ok) {
        res = await fetch(`/api/bookings/${groupRef}/pass.pdf`);
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GatePass-${groupRef}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 150);
        return;
      }
      throw new Error(`PDF generation response status ${res.status}`);
    } catch (err) {
      console.warn('PDF download failed, opening printable pass fallback:', err);
      window.open(`/api/bookings/${booking.group_ref || booking.booking_ref}/pass`, '_blank');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const totalSpent = bookingsList
    .filter(b => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <div className="bg-background text-on-surface min-h-screen pb-20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-xs px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={onBackToBooking}
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 font-bold hover:shadow-xs"
          >
            <ArrowLeft className="w-4 h-4 text-primary" /> Back to Turf Booking
          </button>

          <div className="flex items-center gap-2">
            {onNavigateToPolicies && (
              <button
                onClick={() => onNavigateToPolicies('cancellation')}
                className="px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-headline font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Cancellation Policy & Owner Helpline"
              >
                <RotateCcw className="w-3.5 h-3.5 text-red-600" />
                <span className="hidden sm:inline">Cancellation Policy & Helpline</span>
              </button>
            )}
            <span className="text-xs font-headline font-bold text-primary flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/40">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Account Dashboard
            </span>
            <button
              onClick={onLogout}
              className="btn-secondary text-xs px-3 py-1.5 text-error hover:bg-error/10 border-error/20 flex items-center gap-1 font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Customer Profile Card Header */}
        <section className="bg-white rounded-3xl p-6 md:p-8 border border-outline-variant/50 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center font-headline font-extrabold text-2xl shadow-md ring-4 ring-primary/10">
                {currentCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-headline font-extrabold text-2xl text-primary">{currentCustomer.name}</h1>
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-600" /> GOLD MEMBER
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant mt-1 font-medium">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-primary" /> {currentCustomer.phone.startsWith('+91') ? currentCustomer.phone : `+91 ${currentCustomer.phone}`}
                  </span>
                  {currentCustomer.email ? (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <Mail className="w-3.5 h-3.5 text-primary" /> {currentCustomer.email}
                      {currentCustomer.email_verified ? (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          Unverified
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={openEmailUpdateModal}
                        className="text-[10.5px] font-bold text-primary hover:underline ml-1 inline-flex items-center gap-1 cursor-pointer bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-lg transition"
                        title="Update your email address with OTP verification"
                      >
                        <Edit2 className="w-2.5 h-2.5" /> Update Email
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={openEmailUpdateModal}
                      className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition"
                    >
                      <Mail className="w-3 h-3" /> + Add & Verify Email Address
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="btn-secondary text-xs px-4 py-2 font-headline font-bold flex items-center gap-1.5 self-start md:self-auto"
            >
              {isEditing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4 text-primary" />}
              {isEditing ? 'Cancel Edit' : 'Edit Profile'}
            </button>
          </div>

          {/* Edit Form */}
          {isEditing && (
            <form onSubmit={handleSaveProfile} className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/40 space-y-4 animate-in fade-in">
              <h3 className="font-headline font-bold text-sm text-primary">Update Profile Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-outline-variant bg-white font-medium focus:outline-none focus:border-primary"
                  />
                </div>
                {/* Email Address Section */}
                {!isUpdatingEmailInEdit ? (
                  <div>
                    <label className="block font-bold text-on-surface-variant mb-1">Email Address</label>
                    <div className="w-full px-3.5 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface font-medium text-xs flex items-center justify-between">
                      <span className="truncate">{currentCustomer.email || 'No email configured'}</span>
                      {currentCustomer.email_verified && (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUpdatingEmailInEdit(true);
                          setNewEmailInput('');
                          setEmailOtpSent(false);
                          setEmailOtpCode('');
                          setEmailOtpNotice(null);
                          setEmailOtpError(null);
                        }}
                        className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-xl transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Update Email
                      </button>
                      <span className="text-[10.5px] text-on-surface-variant font-medium">OTP verification required</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 bg-surface-container-high/40 p-3.5 rounded-2xl border border-outline-variant/60 col-span-1 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Update Email Address
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUpdatingEmailInEdit(false);
                          setNewEmailInput('');
                          setEmailOtpSent(false);
                          setEmailOtpCode('');
                          setEmailOtpNotice(null);
                          setEmailOtpError(null);
                        }}
                        className="text-[11px] text-on-surface-variant hover:text-on-surface font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Old Email */}
                      <div>
                        <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
                          Old Email
                        </label>
                        <input
                          type="email"
                          readOnly
                          value={currentCustomer.email || 'None'}
                          className="w-full px-3.5 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-medium text-xs cursor-not-allowed select-none"
                        />
                      </div>

                      {/* New Email Textbox */}
                      <div>
                        <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
                          New Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={newEmailInput}
                          onChange={e => {
                            setNewEmailInput(e.target.value);
                            setEmailOtpError(null);
                          }}
                          placeholder="Enter new email address"
                          className="w-full px-3.5 py-2 rounded-xl border border-outline-variant bg-white font-medium text-xs focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Conflict Warnings */}
                    {editEmailValidation.warning && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                        <span>{editEmailValidation.warning}</span>
                      </div>
                    )}

                    {/* Available Confirmation */}
                    {editEmailValidation.isValid && !editEmailValidation.warning && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span>New email is available for verification.</span>
                      </div>
                    )}

                    {emailOtpError && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                        <span>{emailOtpError}</span>
                      </div>
                    )}

                    {!emailOtpSent ? (
                      <div>
                        <button
                          type="button"
                          disabled={isSendingEmailOtp || !editEmailValidation.isValid || !!editEmailValidation.warning}
                          onClick={e => handleSendEmailOtpForEditUpdate(e)}
                          className="btn-cta py-2 px-4 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          {isSendingEmailOtp ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" /> Send Verification Code
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      /* Step 2: 6-digit OTP verification */
                      <div className="space-y-2.5 pt-1">
                        {emailOtpNotice && (
                          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                            <span>{emailOtpNotice}</span>
                          </div>
                        )}

                        <div className="space-y-1 bg-white p-3 rounded-xl border border-outline-variant/60 max-w-sm">
                          <div className="flex items-center justify-between text-[10px] font-headline font-bold text-on-surface-variant">
                            <span className="flex items-center gap-1">
                              <KeyRound className="w-3 h-3 text-secondary" /> 6-Digit Email Code *
                            </span>
                            <button
                              type="button"
                              disabled={isSendingEmailOtp || emailCooldown > 0}
                              onClick={e => handleResendEmailOtpForEdit(e)}
                              className="text-primary hover:underline font-bold cursor-pointer disabled:opacity-50"
                            >
                              {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Resend Code'}
                            </button>
                          </div>
                          <input
                            type="text"
                            maxLength={6}
                            value={emailOtpCode}
                            onChange={e => setEmailOtpCode(e.target.value)}
                            placeholder="Enter 6-digit OTP"
                            className="w-full px-3 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-extrabold tracking-[0.3em] text-center text-sm"
                          />
                        </div>

                        <div className="flex gap-2 pt-1 max-w-sm">
                          <button
                            type="button"
                            onClick={() => setEmailOtpSent(false)}
                            className="btn-secondary py-1.5 px-3 text-xs font-headline font-bold rounded-xl cursor-pointer"
                          >
                            Change Email
                          </button>
                          <button
                            type="button"
                            onClick={e => handleConfirmEmailOtpForEdit(e)}
                            disabled={isConfirmingEmailOtp}
                            className="btn-cta flex-1 py-1.5 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs cursor-pointer disabled:opacity-60"
                          >
                            {isConfirmingEmailOtp ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" /> Verify & Update Email
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isSendingEmailOtp}
                className="btn-cta text-xs px-5 py-2 font-headline font-bold flex items-center gap-1.5 shadow-xs"
              >
                {isSendingEmailOtp ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Profile Changes
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-outline-variant/40">
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-1">
              <span className="text-[11px] font-headline font-bold text-on-surface-variant uppercase tracking-wider block">
                Total Bookings
              </span>
              <p className="text-2xl font-headline font-extrabold text-primary">{bookingsList.length}</p>
            </div>
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-1">
              <span className="text-[11px] font-headline font-bold text-on-surface-variant uppercase tracking-wider block">
                Active Reservations
              </span>
              <p className="text-2xl font-headline font-extrabold text-emerald-700">{upcomingBookings.length}</p>
            </div>
          </div>
        </section>

        {/* Tab Navigation for Bookings */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-outline-variant/40 pb-2 gap-2">
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'all', label: `All Bookings (${bookingsList.length})`, icon: Layers },
                { id: 'upcoming', label: `Upcoming (${upcomingBookings.length})`, icon: Calendar },
                { id: 'completed', label: `Past Matches (${completedBookings.length})`, icon: CheckCircle2 },
                { id: 'cancelled', label: `Cancelled (${cancelledBookings.length})`, icon: XCircle }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-headline font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-white text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab !== 'upcoming' && (
              <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant font-medium px-1">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Showing history for the last 30 days. Full records are safely archived in venue backups.</span>
              </div>
            )}
          </div>

          {/* Booking Directory Cards List */}
          {displayedBookings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-outline-variant/50 shadow-sm space-y-3">
              <div className="w-16 h-16 bg-surface-container-low text-on-surface-variant/40 rounded-full flex items-center justify-center mx-auto text-3xl">
                🎟️
              </div>
              <h3 className="font-headline font-bold text-lg text-on-surface">No {activeTab === 'all' ? 'booking' : activeTab} records found</h3>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                {activeTab === 'upcoming' 
                  ? "You don't have any active upcoming pitch reservations. Book a court to get started!"
                  : activeTab === 'all'
                  ? "You don't have any bookings yet. Book your first match now!"
                  : `There are no ${activeTab} reservations logged under your account.`}
              </p>
              {(activeTab === 'upcoming' || activeTab === 'all') && (
                <button
                  onClick={onBackToBooking}
                  className="btn-cta text-xs px-6 py-2.5 font-headline font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md mt-2 cursor-pointer"
                >
                  + Book Pitch Now
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedBookings.map(b => {
                const court = courts.find(c => c.id === b.court_id);
                const sport = sports.find(s => s.id === b.sport_id);
                const { refundPct, refundAmount } = calculateRefund(b);
                const isUpcoming = upcomingBookings.some(ub => ub.id === b.id);
                const isRainout = Boolean(
                  (b.refund_reason && (
                    b.refund_reason.toLowerCase().includes('rain') ||
                    b.refund_reason.toLowerCase().includes('weather') ||
                    b.refund_reason.includes('Emergency Rainout')
                  )) ||
                  (b.cancellation_reason && (
                    b.cancellation_reason.toLowerCase().includes('rain') ||
                    b.cancellation_reason.toLowerCase().includes('weather') ||
                    b.cancellation_reason.includes('Emergency Rainout')
                  )) ||
                  (b.cancelled_by === 'admin' && (b.refund_reason?.toLowerCase().includes('rain') || b.notes?.toLowerCase().includes('rain')))
                );

                return (
                  <div
                    key={b.id}
                    className="bg-white rounded-3xl p-5 border border-outline-variant/60 shadow-xs space-y-4 hover:border-primary/50 transition"
                  >
                    {/* Header bar of booking card */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-xs text-primary">{b.group_ref || b.booking_ref}</span>
                          <span
                            className={`badge ${
                              b.status === 'confirmed'
                                ? 'badge-online'
                                : b.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : isRainout
                                ? 'bg-sky-100 text-sky-900 border-sky-300 font-bold'
                                : b.status === 'cancelled' || b.status === 'refunded'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {isRainout ? '🌧️ RAINOUT (OWNER CANCEL)' : b.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <h4 className="font-headline font-bold text-base text-on-surface mt-1 flex items-center gap-1.5">
                          <span>{sport?.icon || '⚽'}</span> {court?.name || 'Turf Court'}
                        </h4>
                      </div>
                      <div className="text-right">
                        <p className="font-headline font-extrabold text-lg text-primary">₹{b.total_amount}</p>
                        {b.status === 'refunded' && b.refund_amount !== undefined && (
                          <span className="block text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-0.5">
                            Refund: ₹{b.refund_amount}
                          </span>
                        )}
                        <span className="text-[10px] text-on-surface-variant font-bold uppercase bg-surface-container-low px-2 py-0.5 rounded-full border border-outline-variant/30 mt-0.5 inline-block">
                          {b.source.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Date & Time Slot Pill */}
                    <div className="bg-surface-container-low p-3 rounded-2xl border border-outline-variant/30 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase block">Date</span>
                          <span className="font-bold text-on-surface">{formatDateDDMMYYYY(b.booking_date)}</span>
                        </div>
                      </div>
                      <div className="h-6 border-r border-outline-variant/40" />
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase block">
                            Slot Session
                          </span>
                          <div className="font-bold text-on-surface flex items-center gap-1">
                            <span className="inline-flex items-center gap-1">
                                <TimeOfDayIcon time24={b.start_time} className="w-3.5 h-3.5" />
                                <span>{formatTime12hPlain(b.start_time)}</span>
                                <span>–</span>
                                <TimeOfDayIcon time24={b.end_time} className="w-3.5 h-3.5" />
                                <span>{formatTime12hPlain(b.end_time)}</span>
                              </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cancellation & Refund Status Strip (When cancelled or refunded) */}
                    {(b.status === 'cancelled' || b.status === 'refunded') && (
                      isRainout ? (
                        <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-3.5 space-y-2 text-sky-950">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 bg-sky-200 text-sky-800 rounded-xl inline-flex items-center justify-center shadow-xs">
                                <CloudRain className="w-4 h-4 text-sky-700 animate-pulse" />
                              </span>
                              <div>
                                <h5 className="font-headline font-bold text-xs text-sky-950 leading-tight">
                                  Cancelled by Turf Owner / Management
                                </h5>
                                <span className="text-[10px] text-sky-700 font-semibold">Proactively cancelled due to rain & waterlogging</span>
                              </div>
                            </div>
                            <span className="font-headline font-extrabold text-emerald-800 bg-white px-2.5 py-1 rounded-xl border border-emerald-300 text-xs shadow-xs">
                              100% Refund: ₹{b.refund_amount || b.total_amount}
                            </span>
                          </div>

                          <p className="text-[11.5px] text-sky-900 leading-relaxed font-medium">
                            This slot was proactively cancelled by the turf owner due to torrential rain and unplayable pitch conditions. A 100% full refund of ₹{b.refund_amount || b.total_amount} has been initiated back to your original payment method.
                          </p>

                          {(b.refund_reason || b.cancellation_reason) && (
                            <div className="text-[10px] text-sky-850 font-mono bg-white/80 p-2 rounded-xl border border-sky-200 flex items-start gap-1.5">
                              <span className="font-bold shrink-0">Owner Note:</span>
                              <span className="leading-tight">{(b.refund_reason || b.cancellation_reason || '').replace('[Emergency Rainout]', '').trim()}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-sky-700 pt-1 border-t border-sky-200 font-medium">
                            <span>Cancelled by: <strong>Venue Owner (Rainout)</strong></span>
                            {b.cancelled_at && (
                              <span>
                                {new Date(b.cancelled_at).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50/80 border border-red-200 rounded-2xl p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-headline font-bold text-red-900 flex items-center gap-1.5 text-xs">
                              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                              {b.status === 'refunded' ? 'Reservation Cancelled & Refunded' : 'Reservation Cancelled'}
                            </span>
                            {b.refund_amount !== undefined && b.refund_amount > 0 && (
                              <span className="font-headline font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded-lg border border-emerald-300 text-[11px] shadow-2xs">
                                Refund: ₹{b.refund_amount}
                              </span>
                            )}
                          </div>
                          {(b.refund_reason || b.cancellation_reason) && (
                            <p className="text-[11px] text-red-800 font-medium leading-relaxed">
                              <span className="font-bold">Reason:</span> {(b.refund_reason || b.cancellation_reason || '').replace('$\\ge$', '≥').replace('$\\le$', '≤').replace('\\ge', '≥').replace('\\le', '≤')}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-red-700/80 pt-1 border-t border-red-200/60 font-medium">
                            <span>
                              {b.cancelled_by === 'customer' ? 'Cancelled by you' : 'Cancelled by turf management'}
                            </span>
                            {b.cancelled_at && (
                              <span>
                                {new Date(b.cancelled_at).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPassModalBooking(b)}
                          className="btn-secondary text-[11px] px-3.5 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Ticket className="w-3.5 h-3.5 text-primary" /> {b.status === 'cancelled' || b.status === 'refunded' ? 'View Cancellation Receipt' : 'View Entry Pass'}
                        </button>
                      </div>

                      {isUpcoming && b.status === 'confirmed' && (
                        <button
                          onClick={() => handleCancelBooking(b)}
                          className="px-3 py-1.5 rounded-xl bg-error/10 text-error hover:bg-error/20 font-headline font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel Reservation
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* Entry Pass & Receipt Modal */}
      {passModalBooking && (() => {
        const allBookings = store.getBookings();
        const passGroupRef = getBookingGroupRef(passModalBooking);
        const passSiblingBookings = allBookings.filter(b => 
          getBookingGroupRef(b) === passGroupRef ||
          (b.group_ref && b.group_ref === passGroupRef) || 
          b.booking_ref === passGroupRef || 
          (passModalBooking.gateway_payment_id && passModalBooking.gateway_payment_id !== '' && b.gateway_payment_id === passModalBooking.gateway_payment_id)
        );

        const isViewingActivePass = passModalBooking.status !== 'cancelled' && passModalBooking.status !== 'refunded';
        const isPassRainout = Boolean(
          (passModalBooking.refund_reason && (
            passModalBooking.refund_reason.toLowerCase().includes('rain') ||
            passModalBooking.refund_reason.toLowerCase().includes('weather') ||
            passModalBooking.refund_reason.includes('Emergency Rainout')
          )) ||
          (passModalBooking.cancellation_reason && (
            passModalBooking.cancellation_reason.toLowerCase().includes('rain') ||
            passModalBooking.cancellation_reason.toLowerCase().includes('weather') ||
            passModalBooking.cancellation_reason.includes('Emergency Rainout')
          )) ||
          (passModalBooking.cancelled_by === 'admin' && (passModalBooking.refund_reason?.toLowerCase().includes('rain') || passModalBooking.notes?.toLowerCase().includes('rain')))
        );

        // When viewing an active pass, NEVER include cancelled or refunded sibling slots
        const activeSiblingBookings = isViewingActivePass
          ? passSiblingBookings.filter(b => b.status !== 'cancelled' && b.status !== 'refunded')
          : passSiblingBookings.filter(b => b.id === passModalBooking.id);

        const passSlots: Array<{ start_time: string; end_time: string; price?: number }> = 
          Array.from(new Map(activeSiblingBookings.map(b => [`${b.start_time}-${b.end_time}`, {
            start_time: b.start_time,
            end_time: b.end_time,
            price: b.total_amount
          }])).values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

        const passGrandTotal = activeSiblingBookings.length > 0 
          ? activeSiblingBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
          : passModalBooking.total_amount;

        const passOtpCode = getBookingGatePassOtp(passModalBooking);

        const court = courts.find(c => c.id === passModalBooking.court_id);

        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-white rounded-3xl max-w-md w-full border border-outline-variant/60 shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
              
              {/* Header with Title & Close Button */}
              <div className={`${isViewingActivePass ? 'bg-[#006b30]' : isPassRainout ? 'bg-sky-900' : 'bg-red-800'} text-white px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between transition-colors`}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white">
                    {isPassRainout ? <CloudRain className="w-4 h-4 text-white" /> : <Ticket className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-headline font-bold text-sm sm:text-base text-white leading-tight">
                        {isViewingActivePass 
                          ? 'Entry Pass & Receipt' 
                          : isPassRainout 
                          ? 'Cancelled by Owner (Rainout)' 
                          : 'Cancelled Reservation'}
                      </h3>
                      {isViewingActivePass && passSlots.length > 1 && (
                        <span className="bg-white/20 text-white text-[9.5px] font-bold px-1.5 py-0.2 rounded-full">
                          {passSlots.length} Slots
                        </span>
                      )}
                      {isPassRainout && (
                        <span className="bg-sky-400/30 text-white border border-sky-300/40 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full">
                          100% Refunded
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/80 font-mono">
                      Ref: {passGroupRef}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setPassModalBooking(null)} 
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body: Clean Structured Ticket Card */}
              <div className="p-3 sm:p-4 space-y-2.5 text-xs overflow-hidden">
                
                {/* 4-Digit Gate Check-in OTP Box */}
                {isViewingActivePass ? (
                  <div className="bg-[#fffbeb] border-2 border-dashed border-[#f59e0b] rounded-xl p-2.5 text-center">
                    <span className="text-[9.5px] font-headline font-extrabold text-[#92400e] uppercase tracking-wider flex items-center justify-center gap-1">
                      <KeyRound className="w-3 h-3 text-[#b45309]" />
                      <span>4-Digit Common Gate Pass</span>
                      <Ticket className="w-3 h-3 text-[#b45309]" />
                    </span>
                    <div className="text-2xl sm:text-3xl font-mono font-black tracking-[6px] text-[#b45309] my-0.5">
                      {passOtpCode}
                    </div>
                    <p className="text-[10px] text-[#92400e] font-medium leading-tight">
                      {passSlots.length > 1
                        ? `Single pass valid for all ${passSlots.length} reserved sessions`
                        : 'Show this 4-digit code or your PDF pass at the gate.'}
                    </p>
                  </div>
                ) : isPassRainout ? (
                  <div className="bg-sky-50 border-2 border-dashed border-sky-300 rounded-xl p-3 text-center space-y-1">
                    <span className="text-[10px] font-headline font-extrabold text-sky-900 uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <CloudRain className="w-4 h-4 text-sky-600 animate-bounce" />
                      <span>Cancelled by Venue Owner — Rainout</span>
                    </span>
                    <div className="text-xl sm:text-2xl font-mono font-black tracking-widest text-sky-300 my-0.5 line-through">
                      {passOtpCode}
                    </div>
                    <p className="text-xs text-sky-900 font-bold leading-tight">
                      Proactively cancelled by turf owner due to torrential rain & unplayable pitch.
                    </p>
                    <p className="text-[10.5px] text-sky-700 font-semibold">
                      100% full refund of ₹{passModalBooking.refund_amount || passModalBooking.total_amount} initiated to original payment method.
                    </p>
                    {passModalBooking.refund_reason && (
                      <p className="text-[9.5px] text-sky-700 font-mono italic mt-0.5">
                        Owner Note: {passModalBooking.refund_reason.replace('[Emergency Rainout]', '').trim()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50 border-2 border-dashed border-red-300 rounded-xl p-2.5 text-center">
                    <span className="text-[10px] font-headline font-extrabold text-red-800 uppercase tracking-wider flex items-center justify-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                      <span>Session Cancelled — Invalid for Entry</span>
                    </span>
                    <div className="text-xl sm:text-2xl font-mono font-black tracking-widest text-red-400 my-0.5 line-through">
                      {passOtpCode}
                    </div>
                    <p className="text-[10px] text-red-700 font-medium leading-tight">
                      {passModalBooking.status === 'refunded'
                        ? `Refund of ₹${passModalBooking.refund_amount || 0} initiated.`
                        : 'This session is cancelled and no longer active.'}
                    </p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="bg-surface-container-low rounded-xl p-2.5 border border-outline-variant/40 grid grid-cols-2 gap-2 text-left text-xs">
                  <div>
                    <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-primary" /> Pitch
                    </span>
                    <span className="font-headline font-bold text-on-surface text-xs truncate block mt-0.5">
                      {court?.name || 'Pitch'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-primary" /> Date & Time
                    </span>
                    <span className="font-medium text-on-surface text-xs block mt-0.5 truncate">
                      {formatDateDDMMYYYY(passModalBooking.booking_date)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 text-primary" /> Timing
                    </span>
                    <span className="font-medium text-primary text-xs block mt-0.5 truncate">
                      {passSlots.length > 1 ? `${passSlots.length} Sessions` : formatTime12hPlain(passModalBooking.start_time)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-primary" /> {isViewingActivePass ? 'Total Paid' : 'Amount'}
                    </span>
                    <span className={`font-headline font-extrabold text-xs sm:text-sm block mt-0.5 ${isViewingActivePass ? 'text-[#006b30]' : 'text-red-700'}`}>
                      ₹{passGrandTotal} {isViewingActivePass ? '(PAID)' : (passModalBooking.status === 'refunded' ? '(REFUNDED)' : '(CANCELLED)')}
                    </span>
                  </div>
                </div>

                {/* Multi-slot sessions breakdown if more than 1 slot */}
                {passSlots.length > 1 && (
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-left">
                    <div className="flex items-center justify-between text-[10px] font-headline font-bold text-slate-600 uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#006b30]" /> Active Reserved Sessions ({passSlots.length})
                      </span>
                      <span className="text-[#006b30] font-black">Valid with Single OTP</span>
                    </div>
                    <div className="space-y-1">
                      {passSlots.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200/60 text-xs">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <TimeOfDayIcon time24={s.start_time} className="w-3.5 h-3.5" />
                            <span>{formatTime12hPlain(s.start_time)} – {formatTime12hPlain(s.end_time)}</span>
                          </span>
                          {s.price != null && (
                            <span className="font-headline font-bold text-[#006b30] text-xs">₹{s.price}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Venue Location & Scannable Location QR Code Card */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/90 flex items-center justify-between gap-3 text-left">
                  {/* Scannable Location QR code */}
                  <div className="text-center shrink-0 bg-white p-1 rounded-lg border border-slate-300 shadow-2xs">
                    {passLocationQrDataUrl ? (
                      <img 
                        src={passLocationQrDataUrl} 
                        alt="Turf Location QR Code" 
                        className="w-16 h-16 sm:w-18 sm:h-18 object-contain rounded"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 flex items-center justify-center">
                        <QrCode className="w-6 h-6 text-slate-400 animate-pulse" />
                      </div>
                    )}
                    <span className="block text-[8px] font-black text-[#006b30] uppercase tracking-wider mt-0.5">
                      Map QR
                    </span>
                  </div>

                  {/* Address & Direct Google Maps Navigation Link */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <MapPin className="w-3 h-3 text-[#006b30] shrink-0" />
                      <span>{venue.name}</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2">
                      {venue.address}
                    </p>
                    <a
                      href={venueLocationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#006b30] hover:underline bg-[#006b30]/10 px-2 py-0.5 rounded-md border border-[#006b30]/20"
                    >
                      <span>Open in Google Maps</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Actions: Download PDF, Print & Close Buttons */}
                <div className="pt-0.5 space-y-1.5">
                  <button
                    onClick={() => handleDownloadPdf(passModalBooking)}
                    disabled={isDownloadingPdf}
                    className="btn-cta w-full py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingPdf ? 'animate-bounce' : ''}`} /> 
                    {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF Gate Pass'}
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        const printWin = window.open(`/api/bookings/${passGroupRef}/pass`, '_blank');
                        if (printWin) {
                          printWin.focus();
                        }
                      }}
                      className="btn-secondary py-1.5 text-xs font-headline font-bold flex items-center justify-center gap-1 border-slate-300 cursor-pointer"
                    >
                      <Printer className="w-3 h-3 text-slate-700" /> Print
                    </button>

                    <button
                      onClick={() => setPassModalBooking(null)}
                      className="py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer text-center"
                    >
                      Close
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* Resend Email OTP Verification Modal for Profile Update */}
      {isVerifyingEmail && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-3xl w-full max-w-sm p-4 sm:p-5 shadow-2xl animate-modalScaleIn text-on-surface space-y-3 overflow-hidden">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  🛡️
                </div>
                <div>
                  <h3 className="font-headline font-bold text-sm sm:text-base text-primary">Update Account Email</h3>
                  <p className="text-[10.5px] text-on-surface-variant font-medium">Verified securely via Resend OTP</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsVerifyingEmail(false);
                  setEmailOtpSent(false);
                  setEmailOtpCode('');
                  setEmailOtpError(null);
                  setEmailOtpNotice(null);
                }}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailOtpNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl text-[10.5px] font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="leading-snug">{emailOtpNotice}</span>
              </div>
            )}

            {emailOtpError && (
              <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-xl text-[10.5px] font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="leading-snug">{emailOtpError}</span>
              </div>
            )}

            {!emailOtpSent ? (
              /* Step 1: Input New Email Address */
              <div className="space-y-3 text-xs">
                {/* Old Email */}
                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant text-[11px] flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-500" /> Old Email
                  </label>
                  <input
                    type="email"
                    readOnly
                    value={currentCustomer.email || 'None'}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface-variant font-medium text-xs cursor-not-allowed select-none"
                  />
                </div>

                {/* New Email Textbox */}
                <div className="space-y-1">
                  <label className="font-headline font-bold text-on-surface-variant text-[11px] flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-primary" /> New Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={e => {
                      setEmailInput(e.target.value);
                      setEmailOtpError(null);
                    }}
                    placeholder="Enter your new email"
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-white font-medium focus:outline-none focus:border-primary text-xs"
                  />
                </div>

                {/* Conflict Warnings */}
                {modalEmailValidation.warning && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                    <span>{modalEmailValidation.warning}</span>
                  </div>
                )}

                {/* Available Confirmation */}
                {modalEmailValidation.isValid && !modalEmailValidation.warning && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>New email is available for verification.</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isSendingEmailOtp || !modalEmailValidation.isValid || !!modalEmailValidation.warning}
                  onClick={handleSendEmailOtpForUpdate}
                  className="btn-cta w-full py-2.5 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSendingEmailOtp ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Send Verification Code
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Step 2: Enter 6-digit OTP */
              <div className="space-y-3 text-xs">
                <p className="text-[11px] text-on-surface-variant leading-snug">
                  Enter the 6-digit verification code sent to <strong>{emailInput}</strong> via Resend:
                </p>

                <div className="space-y-1 bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/40">
                  <div className="flex items-center justify-between text-[10px] font-headline font-bold text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-secondary" /> 6-Digit Email Code *
                    </span>
                    <button
                      type="button"
                      disabled={isSendingEmailOtp || emailCooldown > 0}
                      onClick={handleResendEmailOtp}
                      className="text-primary hover:underline font-bold cursor-pointer disabled:opacity-50"
                    >
                      {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Resend Code'}
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-extrabold tracking-[0.3em] text-center text-sm"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEmailOtpSent(false)}
                    className="btn-secondary py-2 px-3 text-xs font-headline font-bold rounded-xl cursor-pointer"
                  >
                    Change Email
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmEmailOtp}
                    disabled={isConfirmingEmailOtp}
                    className="btn-cta flex-1 py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {isConfirmingEmailOtp ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verify & Update Email
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancellation & Refund Confirmation Popup */}
      <CancelBookingConfirmModal
        booking={cancelModalBooking}
        isOpen={!!cancelModalBooking}
        onClose={() => setCancelModalBooking(null)}
        onConfirmed={handleExecuteCancellation}
        onSuccessDone={() => {
          setCancelModalBooking(null);
          // If on 'all', stay on 'all' so the customer sees their freshly cancelled booking right at the top
          setActiveTab(prev => (prev === 'all' ? 'all' : 'cancelled'));
        }}
      />

    </div>
  );
};
