import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Customer, Booking } from '../../types/schema';
import { formatTimeRange12h, formatDateDDMMYYYY } from '../../utils/formatters';
import { CancelBookingConfirmModal } from './CancelBookingConfirmModal';
import { 
  User, Phone, Mail, Calendar, ArrowLeft, ShieldCheck, Ticket, 
  XCircle, CheckCircle2, Clock, Award, LogOut, Edit2, Save, X, KeyRound, RotateCcw,
  Download, Printer, AlertCircle, Sparkles
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
      // 1. Try GET /api/bookings/:ref/pass.pdf
      let res = await fetch(`/api/bookings/${booking.booking_ref}/pass.pdf`);
      // 2. If not found in server cache, fallback to POST with client booking payload
      if (!res.ok) {
        res = await fetch('/api/bookings/generate-pass-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking })
        });
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GatePass-${booking.booking_ref}.pdf`;
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
      window.open(`/api/bookings/${booking.booking_ref}/pass`, '_blank');
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
              <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-headline font-extrabold text-2xl shadow-md">
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
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-primary">{b.booking_ref}</span>
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
                          <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase block">Slot Session</span>
                          <span className="font-bold text-on-surface">{formatTimeRange12h(b.start_time, b.end_time)}</span>
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
      {passModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-scrollbar">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-outline-variant/60 shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
            
            {/* Header with Title & Close Button (No PDF View switch) */}
            <div className="bg-[#006b30] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white">
                  <Ticket className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-base text-white leading-tight">
                    Official Venue Entry Pass & Receipt
                  </h3>
                  <p className="text-[11px] text-white/80 font-mono mt-0.5">
                    Ref: {passModalBooking.booking_ref}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setPassModalBooking(null)} 
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Clean Structured Ticket Card */}
            <div 
              className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto no-scrollbar"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              
              {/* 4-Digit Gate Check-in OTP Box */}
              <div className="bg-[#fffbeb] border-2 border-dashed border-[#f59e0b] rounded-2xl p-4 text-center">
                <span className="text-[10px] font-headline font-extrabold text-[#92400e] uppercase tracking-wider block">
                  4-Digit Gate Check-in OTP Pass
                </span>
                <div className="text-3xl sm:text-4xl font-mono font-black tracking-[8px] text-[#b45309] my-1.5">
                  {passModalBooking.booking_ref.slice(-4)}
                </div>
                <p className="text-[11px] text-[#92400e] font-medium">
                  Show this 4-digit code or your PDF pass to the gate manager for pitch entry.
                </p>
              </div>

              {/* Details Grid */}
              <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/40 grid grid-cols-2 gap-3.5 text-left text-xs">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Booking Reference
                  </span>
                  <span className="font-mono font-bold text-primary text-sm">
                    {passModalBooking.booking_ref}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Reserved Pitch
                  </span>
                  <span className="font-headline font-bold text-on-surface text-xs">
                    {courts.find(c => c.id === passModalBooking.court_id)?.name || 'Main Pitch'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Match Date
                  </span>
                  <span className="font-medium text-on-surface">
                    {formatDateDDMMYYYY(passModalBooking.booking_date)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Slot Timing
                  </span>
                  <span className="font-medium text-on-surface">
                    {formatTimeRange12h(passModalBooking.start_time, passModalBooking.end_time)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Customer Details
                  </span>
                  <span className="font-medium text-on-surface block">
                    {currentCustomer.name}
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-mono">
                    +91 {currentCustomer.phone}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">
                    Total Paid
                  </span>
                  <span className="font-headline font-extrabold text-[#006b30] text-sm">
                    ₹{passModalBooking.total_amount} (PAID)
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold block">
                    ✓ Verified (Razorpay UPI)
                  </span>
                </div>
              </div>

              {/* Venue Location & Guidelines */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-left text-[11px] text-slate-600 space-y-1">
                <p><strong className="text-slate-800">Venue Location:</strong> {venue.address}</p>
                <p><strong className="text-slate-800">Helpdesk:</strong> {venue.contact_phone} | <strong className="text-slate-800">GSTIN:</strong> {venue.gst_number || '27AABCT1234F1Z0'}</p>
                <p className="text-[#006b30] font-medium">⚠️ Turf shoes / flat rubber soles only. Please arrive 10 minutes early.</p>
              </div>

            </div>

            {/* Footer with Download PDF, Print & Close Buttons */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                {/* Download PDF Pass Option */}
                <button
                  onClick={() => handleDownloadPdf(passModalBooking)}
                  disabled={isDownloadingPdf}
                  className="btn-cta text-xs px-4 py-2.5 font-headline font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  <Download className={`w-4 h-4 ${isDownloadingPdf ? 'animate-bounce' : ''}`} /> 
                  {isDownloadingPdf ? 'Downloading PDF...' : 'Download PDF Pass'}
                </button>

                {/* Print / View Pass Option */}
                <button
                  onClick={() => {
                    const printWin = window.open(`/api/bookings/${passModalBooking.booking_ref}/pass`, '_blank');
                    if (printWin) {
                      printWin.focus();
                    }
                  }}
                  className="btn-secondary text-xs px-3.5 py-2.5 font-headline font-bold flex items-center gap-1.5 border-slate-300 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-700" /> Print Pass
                </button>

              </div>

              <button
                onClick={() => setPassModalBooking(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Resend Email OTP Verification Modal for Profile Update */}
      {isVerifyingEmail && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-3xl w-full max-w-md p-6 shadow-2xl animate-modalScaleIn text-on-surface space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  🛡️
                </div>
                <div>
                  <h3 className="font-headline font-bold text-base text-primary">Verify New Email</h3>
                  <p className="text-[11px] text-on-surface-variant font-medium">Confirmation code sent via Resend</p>
                </div>
              </div>
              <button
                onClick={() => setIsVerifyingEmail(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              We've dispatched a 6-digit verification code to <strong>{emailInput}</strong> via Resend. Enter it below to verify and complete your profile email update:
            </p>

            {emailOtpNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-xs font-medium flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{emailOtpNotice}</span>
              </div>
            )}

            {emailOtpError && (
              <div className="bg-error/10 border border-error/30 text-error p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{emailOtpError}</span>
              </div>
            )}

            <div className="space-y-1 bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40">
              <label className="font-headline font-bold text-xs text-on-surface-variant flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-secondary" /> 6-Digit Code *
                </span>
                <span className="text-[10px] text-primary font-mono font-bold">Demo: 123456</span>
              </label>
              <input
                type="text"
                maxLength={6}
                value={emailOtpCode}
                onChange={e => setEmailOtpCode(e.target.value)}
                placeholder="Enter 6-digit OTP"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white font-mono font-extrabold tracking-[0.3em] text-center text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmEmailOtp}
                disabled={isConfirmingEmailOtp}
                className="btn-cta flex-1 py-2.5 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md"
              >
                {isConfirmingEmailOtp ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Verify & Save Email
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResendEmailOtp}
                disabled={isSendingEmailOtp}
                className="btn-secondary px-3.5 py-2.5 text-xs font-bold whitespace-nowrap"
              >
                {isSendingEmailOtp ? 'Sending...' : 'Resend'}
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
