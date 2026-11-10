import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Customer, Booking } from '../../types/schema';
import { formatTimeRange12h, formatTime12hPlain, formatDateDDMMYYYY, formatPhoneNumber, getBookingGatePassOtp, getBookingGroupRef } from '../../utils/formatters';
import { TimeOfDayIcon } from '../common/TimeOfDayIcon';
import { CancelBookingConfirmModal } from './CancelBookingConfirmModal';
import { 
  User, Phone, Mail, Calendar, ArrowLeft, ShieldCheck, Ticket, 
  XCircle, CheckCircle2, Clock, Award, LogOut, Edit2, Save, X, KeyRound, RotateCcw,
  Download, Printer, AlertCircle, Sparkles, Trophy, CreditCard, Tag, AlertTriangle, FileDown,
  Sun, Moon, MapPin
} from 'lucide-react';
import { EmailVerificationService } from '../../services/emailVerificationService';
import { CustomerAuthService } from '../../services/customerAuthService';
import { SupabaseSyncService } from '../../services/supabaseSyncService';

interface CustomerProfilePageProps {
  currentCustomer: Customer;
  onBackToBooking: () => void;
  onLogout: () => void;
  onUpdateCustomer: (updated: Customer) => void;
}

export const CustomerProfilePage: React.FC<CustomerProfilePageProps> = ({
  currentCustomer,
  onBackToBooking,
  onLogout,
  onUpdateCustomer
}) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming');
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [nameInput, setNameInput] = useState(currentCustomer.name);
  const [emailInput, setEmailInput] = useState(currentCustomer.email || '');

  // Email verification modal states (Resend OTP)
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpNotice, setEmailOtpNotice] = useState<string | null>(null);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);
  const [isConfirmingEmailOtp, setIsConfirmingEmailOtp] = useState(false);

  // Selected booking for Entry Pass Modal
  const [passModalBooking, setPassModalBooking] = useState<Booking | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const venue = store.getVenue();
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

  const [bookingsList, setBookingsList] = useState<Booking[]>(() => 
    store.getBookings().filter(b => customerIds.has(b.customer_id))
  );
  const courts = store.getCourts();
  const sports = store.getSports();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`; // Local YYYY-MM-DD string
  const currentMins = now.getHours() * 60 + now.getMinutes();

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
    if (b.status === 'completed') return true;
    if (b.booking_date < todayStr) return true;
    if (b.booking_date === todayStr) {
      const [endH, endM] = (b.end_time || '23:59').split(':').map(Number);
      return (endH * 60 + (endM || 0)) <= currentMins;
    }
    return false;
  });

  const cancelledBookings = bookingsList.filter(b => b.status === 'cancelled' || b.status === 'refunded');

  const displayedBookings = 
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
    if (!cancelModalBooking) return;
    const targetBooking = cancelModalBooking;
    const nextStatus = refundAmount > 0 ? 'refunded' : 'cancelled';

    const result = PostgresEngine.updateBookingStatus(targetBooking.id, nextStatus, {
      refundAmount,
      refundReason,
      cancelledBy: 'customer',
      noticeHours,
      metTerms
    });

    if (result.success) {
      const businessDays = store.getCancellationSettings().processing_business_days || '5-7';
      if (refundAmount > 0) {
        alert(`Booking ${targetBooking.booking_ref} cancelled successfully!\n\nA refund of ₹${refundAmount} has been initiated and will reach your original payment method within ${businessDays} business days.`);
      } else {
        alert(`Booking ${targetBooking.booking_ref} cancelled.\n\nUnder venue terms, cancellations made within ${store.getCancellationSettings().cutoff_hours} hours of booking time are non-refundable (₹0 refund).`);
      }

      setBookingsList(prev => prev.map(b => b.id === targetBooking.id ? { 
        ...b, 
        status: nextStatus,
        refund_amount: refundAmount,
        refund_reason: refundReason,
        cancelled_by: 'customer',
        cancellation_notice_hours: noticeHours,
        cancellation_met_terms: metTerms
      } : b));
      setCancelModalBooking(null);
    } else {
      alert(result.message);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNewEmail = emailInput.trim().toLowerCase();
    const currentEmail = (currentCustomer.email || '').trim().toLowerCase();

    // If customer edited or added a new email, require Resend verification
    if (cleanNewEmail && cleanNewEmail !== currentEmail) {
      setIsSendingEmailOtp(true);
      setEmailOtpError(null);
      setEmailOtpNotice(null);

      const res = await EmailVerificationService.requestOtp(cleanNewEmail, 'profile_update', nameInput.trim());
      setIsSendingEmailOtp(false);

      if (res.success) {
        setIsVerifyingEmail(true);
        setEmailOtpNotice(res.message);
        if (res.code) {
          setEmailOtpCode(res.code); // Prefill demo code in trial/sandbox mode
        }
      } else {
        alert(res.message || 'Could not send verification email via Resend.');
      }
      return;
    }

    // Only name changed (or email was cleared)
    const updated = {
      ...currentCustomer,
      name: nameInput.trim(),
      email: cleanNewEmail || undefined
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
    alert('Profile details updated successfully!');
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
        name: nameInput.trim(),
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
      setEmailOtpCode('');
      setEmailOtpNotice(null);
      alert('Email verified via Resend and profile updated successfully!');
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
      setEmailOtpNotice(res.message);
      if (res.code) setEmailOtpCode(res.code);
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
      const allSlots = (booking.all_slots && booking.all_slots.length > 0)
        ? booking.all_slots
        : Array.from(new Map(siblingBookings.map(b => [`${b.start_time}-${b.end_time}`, {
            start_time: b.start_time,
            end_time: b.end_time,
            price: b.total_amount
          }])).values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

      const grandTotal = booking.total_order_amount ?? (
        siblingBookings.length > 0 
          ? siblingBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
          : booking.total_amount
      );
      const formattedSlots = booking.formatted_slots || 
        allSlots.map(s => formatTimeRange12h(s.start_time, s.end_time)).join(', ');
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
            <span className="text-xs font-headline font-bold text-primary flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/40">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Account Dashboard
            </span>
            <button
              onClick={onLogout}
              className="btn-secondary text-xs px-3 py-1.5 text-error hover:bg-error/10 border-error/20 flex items-center gap-1 font-bold"
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
                  {currentCustomer.email && (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <Mail className="w-3.5 h-3.5 text-primary" /> {currentCustomer.email}
                      {currentCustomer.email_verified ? (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified via Resend
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          Unverified
                        </span>
                      )}
                    </span>
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
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Email Address</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-outline-variant bg-white font-medium focus:outline-none focus:border-primary"
                  />
                  {emailInput.trim().toLowerCase() !== (currentCustomer.email || '').trim().toLowerCase() && emailInput.trim() && (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 p-2 rounded-xl mt-1.5 font-medium flex items-center gap-1.5 animate-in fade-in">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      Updating your email triggers a 6-digit verification code sent via Resend.
                    </p>
                  )}
                </div>
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
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
            <div className="flex gap-2">
              {[
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
                    className={`px-4 py-2.5 rounded-2xl text-xs font-headline font-bold flex items-center gap-2 transition-all ${
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
          </div>

          {/* Booking Directory Cards List */}
          {displayedBookings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-outline-variant/50 shadow-sm space-y-3">
              <div className="w-16 h-16 bg-surface-container-low text-on-surface-variant/40 rounded-full flex items-center justify-center mx-auto text-3xl">
                🎟️
              </div>
              <h3 className="font-headline font-bold text-lg text-on-surface">No {activeTab} bookings found</h3>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                {activeTab === 'upcoming' 
                  ? "You don't have any active upcoming pitch reservations. Book a court to get started!"
                  : `There are no ${activeTab} reservations logged under your account.`}
              </p>
              {activeTab === 'upcoming' && (
                <button
                  onClick={onBackToBooking}
                  className="btn-cta text-xs px-6 py-2.5 font-headline font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md mt-2"
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
                                : b.status === 'cancelled' || b.status === 'refunded'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {b.status.replace('_', ' ').toUpperCase()}
                          </span>
                          {b.all_slots && b.all_slots.length > 1 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              {b.all_slots.length} Slots Pass
                            </span>
                          )}
                        </div>
                        <h4 className="font-headline font-bold text-base text-on-surface mt-1 flex items-center gap-1.5">
                          <span>{sport?.icon || '⚽'}</span> {court?.name || 'Turf Court'}
                        </h4>
                      </div>
                      <div className="text-right">
                        <p className="font-headline font-extrabold text-lg text-primary">₹{b.total_order_amount ?? b.total_amount}</p>
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
                            {b.all_slots && b.all_slots.length > 1 ? `Slot Sessions (${b.all_slots.length})` : 'Slot Session'}
                          </span>
                          <div className="font-bold text-on-surface flex items-center gap-1">
                            {b.formatted_slots ? (
                              <span>{b.formatted_slots}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <TimeOfDayIcon time24={b.start_time} className="w-3.5 h-3.5" />
                                <span>{formatTime12hPlain(b.start_time)}</span>
                                <span>–</span>
                                <TimeOfDayIcon time24={b.end_time} className="w-3.5 h-3.5" />
                                <span>{formatTime12hPlain(b.end_time)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPassModalBooking(b)}
                          className="btn-secondary text-[11px] px-3.5 py-1.5 font-bold flex items-center gap-1.5"
                        >
                          <Ticket className="w-3.5 h-3.5 text-primary" /> View Entry Pass
                        </button>
                      </div>

                      {isUpcoming && (
                        <button
                          onClick={() => handleCancelBooking(b)}
                          className="px-3 py-1.5 rounded-xl bg-error/10 text-error hover:bg-error/20 font-headline font-bold text-[11px] flex items-center gap-1 transition"
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

        const passSlots: Array<{ start_time: string; end_time: string; price?: number }> = 
          (passModalBooking.all_slots && passModalBooking.all_slots.length > 0)
            ? passModalBooking.all_slots
            : Array.from(new Map(passSiblingBookings.map(b => [`${b.start_time}-${b.end_time}`, {
                start_time: b.start_time,
                end_time: b.end_time,
                price: b.total_amount
              }])).values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

        const passGrandTotal = passModalBooking.total_order_amount ?? (
          passSiblingBookings.length > 0 
            ? passSiblingBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
            : passModalBooking.total_amount
        );

        const passOtpCode = getBookingGatePassOtp(passModalBooking);

        const court = courts.find(c => c.id === passModalBooking.court_id);

        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-white rounded-3xl max-w-md w-full border border-outline-variant/60 shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
              
              {/* Header with Title & Close Button */}
              <div className="bg-[#006b30] text-white px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white">
                    <Ticket className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-headline font-bold text-sm sm:text-base text-white leading-tight">
                        Entry Pass & Receipt
                      </h3>
                      {passSlots.length > 1 && (
                        <span className="bg-white/20 text-white text-[9.5px] font-bold px-1.5 py-0.2 rounded-full">
                          {passSlots.length} Slots
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
                      <CreditCard className="w-3 h-3 text-primary" /> Total Paid
                    </span>
                    <span className="font-headline font-extrabold text-[#006b30] text-xs sm:text-sm block mt-0.5">
                      ₹{passGrandTotal} (PAID)
                    </span>
                  </div>
                </div>

                {/* Multi-slot sessions breakdown if more than 1 slot */}
                {passSlots.length > 1 && (
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-left">
                    <div className="flex items-center justify-between text-[10px] font-headline font-bold text-slate-600 uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#006b30]" /> All Reserved Sessions ({passSlots.length})
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

                {/* Venue Location Line */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-left text-[10.5px] text-slate-600">
                  <MapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{venue.name} • {venue.address}</span>
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
          <div className="bg-white border border-outline-variant rounded-3xl w-full max-w-sm p-3.5 sm:p-5 shadow-2xl animate-modalScaleIn text-on-surface space-y-2.5 overflow-hidden">
            <div className="flex justify-between items-center pb-1.5 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  🛡️
                </div>
                <div>
                  <h3 className="font-headline font-bold text-sm sm:text-base text-primary">Verify New Email</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">Confirmation code sent via Resend</p>
                </div>
              </div>
              <button
                onClick={() => setIsVerifyingEmail(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-on-surface-variant leading-tight">
              We dispatched a 6-digit code to <strong>{emailInput}</strong> via Resend.
            </p>

            {emailOtpNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-xl text-[10px] font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{emailOtpNotice}</span>
              </div>
            )}

            {emailOtpError && (
              <div className="bg-error/10 border border-error/30 text-error p-2 rounded-xl text-[10px] font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="truncate">{emailOtpError}</span>
              </div>
            )}

            <div className="space-y-0.5 bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/40">
              <div className="flex items-center justify-between text-[10px] font-headline font-bold text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-secondary" /> 6-Digit Code *
                </span>
                <span className="text-primary font-mono">Demo: 123456</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={emailOtpCode}
                onChange={e => setEmailOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-1.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary bg-white font-mono font-extrabold tracking-[0.3em] text-center text-sm"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmEmailOtp}
                disabled={isConfirmingEmailOtp}
                className="btn-cta flex-1 py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm cursor-pointer"
              >
                {isConfirmingEmailOtp ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verify & Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation & Refund Confirmation Popup */}
      <CancelBookingConfirmModal
        booking={cancelModalBooking}
        isOpen={!!cancelModalBooking}
        onClose={() => setCancelModalBooking(null)}
        onConfirmed={handleExecuteCancellation}
      />

    </div>
  );
};
