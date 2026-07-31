import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Customer, Booking } from '../../types/schema';
import { formatTimeRange12h } from '../../utils/formatters';
import { 
  User, Phone, Mail, Calendar, ArrowLeft, ShieldCheck, Ticket, 
  XCircle, CheckCircle2, Clock, Award, LogOut, Edit2, Save, X, KeyRound
} from 'lucide-react';

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

  // Selected booking for Entry Pass Modal
  const [passModalBooking, setPassModalBooking] = useState<Booking | null>(null);

  // Get customer's bookings from store (match by ID or Phone number)
  const customerIds = new Set(
    store.getCustomers().filter(c => c.phone === currentCustomer.phone).map(c => c.id)
  );
  customerIds.add(currentCustomer.id);

  const allBookings = store.getBookings().filter(b => customerIds.has(b.customer_id));
  const courts = store.getCourts();
  const sports = store.getSports();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`; // Local YYYY-MM-DD string
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Categorize bookings
  const upcomingBookings = allBookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'refunded' || b.status === 'completed') return false;
    if (b.booking_date > todayStr) return true;
    if (b.booking_date === todayStr) {
      const [endH, endM] = (b.end_time || '23:59').split(':').map(Number);
      return (endH * 60 + (endM || 0)) > currentMins;
    }
    return false;
  });

  const completedBookings = allBookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'refunded') return false;
    if (b.status === 'completed') return true;
    if (b.booking_date < todayStr) return true;
    if (b.booking_date === todayStr) {
      const [endH, endM] = (b.end_time || '23:59').split(':').map(Number);
      return (endH * 60 + (endM || 0)) <= currentMins;
    }
    return false;
  });

  const cancelledBookings = allBookings.filter(b => b.status === 'cancelled' || b.status === 'refunded');

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
    const { refundPct, refundAmount } = calculateRefund(booking);

    const confirmMsg = `Cancel booking ${booking.booking_ref}?\n\nRefund Policy:\n- Refund percentage: ${refundPct}%\n- Estimated refund: ₹${refundAmount}`;
    if (!confirm(confirmMsg)) return;

    const result = PostgresEngine.updateBookingStatus(booking.id, refundPct > 0 ? 'refunded' : 'cancelled');
    if (result.success) {
      alert(`Booking ${booking.booking_ref} cancelled. Refund of ₹${refundAmount} initiated.`);
      window.location.reload();
    } else {
      alert(result.message);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...currentCustomer,
      name: nameInput.trim(),
      email: emailInput.trim()
    };

    const customers = store.getCustomers();
    const idx = customers.findIndex(c => c.id === currentCustomer.id);
    if (idx !== -1) {
      customers[idx] = updated;
      store.setCustomers(customers);
    }

    onUpdateCustomer(updated);
    setIsEditing(false);
    alert('Profile details updated successfully!');
  };

  const totalSpent = allBookings
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
                    <Phone className="w-3.5 h-3.5 text-primary" /> +91 {currentCustomer.phone}
                  </span>
                  {currentCustomer.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-primary" /> {currentCustomer.email}
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
                </div>
              </div>
              <button
                type="submit"
                className="btn-cta text-xs px-5 py-2 font-headline font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Save className="w-4 h-4" /> Save Profile Changes
              </button>
            </form>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-outline-variant/40">
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-1">
              <span className="text-[11px] font-headline font-bold text-on-surface-variant uppercase tracking-wider block">
                Total Bookings
              </span>
              <p className="text-2xl font-headline font-extrabold text-primary">{allBookings.length}</p>
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
                        <span className="text-[10px] text-on-surface-variant font-bold uppercase bg-surface-container-low px-2 py-0.5 rounded-full border border-outline-variant/30">
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
                          <span className="font-bold text-on-surface">{b.booking_date}</span>
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

      {/* Entry Pass Number Modal */}
      {passModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-outline-variant/60 shadow-2xl space-y-4 text-center animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
              <h3 className="font-headline font-bold text-base text-primary flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-primary" /> Official Venue Gate Pass
              </h3>
              <button onClick={() => setPassModalBooking(null)} className="text-on-surface-variant hover:text-on-surface">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-surface-container-low rounded-2xl border border-outline-variant/40 space-y-3">
              <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-wider block">
                Pass Number
              </span>
              <div className="bg-primary/10 border border-primary/30 p-3 rounded-xl">
                <p className="font-mono font-extrabold text-xl text-primary tracking-wider">
                  {passModalBooking.booking_ref}
                </p>
              </div>

              <div className="text-left text-xs space-y-1.5 pt-2 border-t border-outline-variant/30 text-on-surface-variant font-medium">
                <p><strong className="text-on-surface">Customer:</strong> {currentCustomer.name} (+91 {currentCustomer.phone})</p>
                <p><strong className="text-on-surface">Pitch:</strong> {courts.find(c => c.id === passModalBooking.court_id)?.name}</p>
                <p><strong className="text-on-surface">Session:</strong> {passModalBooking.booking_date} ({formatTimeRange12h(passModalBooking.start_time, passModalBooking.end_time)})</p>
              </div>

              <p className="text-[11px] text-primary font-bold pt-1">
                Present this Pass Number at the front counter for pitch entry.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
