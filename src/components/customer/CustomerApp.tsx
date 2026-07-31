import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { Sport, Court, DynamicSlot, Customer } from '../../types/schema';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { CustomerAuthService } from '../../services/customerAuthService';
import { CustomerAuthModal } from './CustomerAuthModal';
import { CustomerProfilePage } from './CustomerProfilePage';
import { SlotGrid } from './SlotGrid';
import { CheckoutModal } from './CheckoutModal';
import { BookingConfirmationModal } from './BookingConfirmationModal';
import { BookingLookupModal } from './BookingLookupModal';
import { ActiveCustomerHoldModal } from '../common/ActiveCustomerHoldModal';
import { formatTimeRange12h } from '../../utils/formatters';
import { ChevronRight, Search, UserCheck, User, LogOut, ShieldCheck, Ticket } from 'lucide-react';

interface CustomerAppProps {
  onSwitchToAdmin: () => void;
}

export const CustomerApp: React.FC<CustomerAppProps> = ({ onSwitchToAdmin }) => {
  const venue = store.getVenue();
  const allSports = store.getSports();
  const allCourts = store.getCourts();

  // View state: 'booking' vs 'profile'
  const [customerView, setCustomerView] = useState<'booking' | 'profile'>('booking');

  // Filter sports to only those that have active courts configured at this venue
  const activeCourts = allCourts.filter(c => c.status === 'active');
  const sports = allSports.filter(s => activeCourts.some(c => c.sport_ids.includes(s.id)));
  const availableSports = sports.length > 0 ? sports : allSports;

  const [selectedSport, setSelectedSport] = useState<Sport>(availableSports[0]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);

  // Quick filter state
  const [activeFilter, setActiveFilter] = useState<'today' | 'tomorrow' | 'weekend' | 'all'>('today');

  // Customer authentication state
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(() => {
    return CustomerAuthService.getAuthenticatedCustomer();
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Date strip setup (next 14 days)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const dateStrip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    return { iso, dayName, dayNum, monthName };
  });

  const [sessionId] = useState(() => `sess_${Math.floor(Math.random() * 1000000)}`);
  const [selectedSlots, setSelectedSlots] = useState<DynamicSlot[]>([]);

  // Modals
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmedBookingRef, setConfirmedBookingRef] = useState<string | null>(null);
  const [showLookup, setShowLookup] = useState(false);
  const [selectedHoldSlot, setSelectedHoldSlot] = useState<{ court: Court; date: string; time: string } | null>(null);

  const [computedSlots, setComputedSlots] = useState<DynamicSlot[]>([]);

  const availableCourts = activeCourts.filter(
    c => c.sport_ids.includes(selectedSport?.id || '')
  );

  useEffect(() => {
    if (availableCourts.length > 0 && (!selectedCourt || !selectedCourt.sport_ids.includes(selectedSport.id))) {
      setSelectedCourt(availableCourts[0]);
    }
  }, [selectedSport, availableCourts]);

  const refreshSlots = () => {
    if (selectedCourt) {
      const slots = SlotEngine.computeSlotsForCourt(selectedCourt, selectedDate, sessionId);
      setComputedSlots(slots);
    }
  };

  useEffect(() => {
    refreshSlots();
    const interval = setInterval(refreshSlots, 15000);
    return () => clearInterval(interval);
  }, [selectedCourt, selectedDate]);

  const handleToggleSlot = (slot: DynamicSlot) => {
    if (!selectedCourt) return;

    // If slot is currently locked by another customer, show Active Customer Hold Modal
    if (slot.status === 'locked') {
      const isMyLock = slot.locked_by === sessionId;
      if (!isMyLock) {
        setSelectedHoldSlot({ court: selectedCourt, date: selectedDate, time: slot.start_time });
        return;
      }
    }

    const exists = selectedSlots.some(s => s.start_time === slot.start_time);
    if (exists) {
      RedisLockService.releaseLock(selectedCourt.id, selectedDate, slot.start_time, sessionId);
      setSelectedSlots(selectedSlots.filter(s => s.start_time !== slot.start_time));
      refreshSlots();
    } else {
      const lockRes = RedisLockService.acquireLock(selectedCourt.id, selectedDate, slot.start_time, sessionId);
      if (lockRes.success) {
        setSelectedSlots([...selectedSlots, slot].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        refreshSlots();
      } else {
        setSelectedHoldSlot({ court: selectedCourt, date: selectedDate, time: slot.start_time });
      }
    }
  };

  const handleFilterClick = (filter: 'today' | 'tomorrow' | 'weekend' | 'all') => {
    setActiveFilter(filter);
    const now = new Date();
    if (filter === 'today') {
      setSelectedDate(todayStr);
    } else if (filter === 'tomorrow') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      setSelectedDate(tom.toISOString().split('T')[0]);
    } else if (filter === 'weekend') {
      const day = now.getDay();
      const diffToSat = (6 - day + 7) % 7;
      const sat = new Date();
      sat.setDate(sat.getDate() + diffToSat);
      setSelectedDate(sat.toISOString().split('T')[0]);
    }
    setSelectedSlots([]);
  };

  const handleProceedCheckout = () => {
    if (!currentCustomer) {
      setShowAuthModal(true);
      return;
    }
    setShowCheckout(true);
  };

  const handleCustomerLogout = () => {
    CustomerAuthService.logout();
    setCurrentCustomer(null);
    setCustomerView('booking');
  };

  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);

  // Sport card image map matching Stitch mockups
  const sportImages: Record<string, { img: string; subtitle: string; courts: string }> = {
    football: {
      img: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=600&q=80',
      subtitle: '5-a-side & 11-a-side',
      courts: '8 Courts Available'
    },
    tennis: {
      img: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Clay & Hard Acrylic Courts',
      courts: '4 Courts Available'
    },
    basketball: {
      img: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Indoor High-Gloss Maple',
      courts: '2 Courts Available'
    },
    badminton: {
      img: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80',
      subtitle: 'BWF Wooden Synthetic',
      courts: '6 Courts Available'
    },
    cricket: {
      img: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Indoor Net & Turf Pitch',
      courts: '3 Courts Available'
    }
  };

  // If customer is viewing Profile page
  if (customerView === 'profile' && currentCustomer) {
    return (
      <CustomerProfilePage
        currentCustomer={currentCustomer}
        onBackToBooking={() => setCustomerView('booking')}
        onLogout={handleCustomerLogout}
        onUpdateCustomer={(updated) => setCurrentCustomer(updated)}
      />
    );
  }

  return (
    <div className="bg-background text-on-surface min-h-screen pb-28">
      {/* Stitch TopAppBar Header */}
      <header className="sticky top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm flex items-center justify-between max-w-[1200px] mx-auto min-h-16 px-3 sm:px-4 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm shrink-0 cursor-pointer" onClick={() => setCustomerView('booking')}>
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>sports_soccer</span>
          </div>
          <div>
            <h1 className="font-headline font-bold text-lg sm:text-2xl text-primary leading-none tracking-tight cursor-pointer" onClick={() => setCustomerView('booking')}>
              {venue.name}
            </h1>
            <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium mt-0.5 hidden sm:flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-xs" style={{ fontSize: '14px' }}>location_on</span>
              HSR Layout, Bengaluru • 4.9 ★ Rating
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentCustomer ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCustomerView('profile')}
                className="btn-primary px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-headline font-bold flex items-center gap-1.5 shadow-sm"
                title="View Profile & Bookings Dashboard"
              >
                <Ticket className="w-4 h-4 text-white shrink-0" />
                <span>{currentCustomer.name}</span>
                <span className="opacity-80 text-[10px] hidden sm:inline">(My Bookings)</span>
              </button>

              <button
                onClick={handleCustomerLogout}
                title="Sign Out"
                className="p-1.5 sm:p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition border border-outline-variant/40"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="btn-cta px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-headline font-bold flex items-center gap-1.5 shadow-sm"
            >
              <User className="w-4 h-4" /> Sign In / My Bookings
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 pt-6 space-y-8">
        {/* Stitch Hero Banner Section */}
        <section className="relative rounded-2xl overflow-hidden shadow-md group border border-outline-variant/40">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/80 to-primary-container/40 z-10"></div>
          <div
            className="h-64 md:h-72 w-full bg-cover bg-center"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80')`
            }}
          ></div>
          <div className="absolute inset-0 z-20 flex flex-col justify-center p-6 md:p-10 text-on-primary">
            <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-headline font-bold text-xs w-fit mb-3 tracking-wide">
              PROMOTED VENUE
            </span>
            <h2 className="font-headline font-bold text-3xl md:text-4xl mb-2 leading-tight max-w-xl text-white">
              Prime Time Slots Available
            </h2>
            <p className="font-body text-sm md:text-base text-on-primary-container/90 max-w-md mb-6 leading-relaxed">
              Secure your preferred evening pitches with instant Redis slot locks and zero double booking guarantee.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const el = document.getElementById('court-selection');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn-cta px-6 py-2.5 text-sm font-headline uppercase tracking-wider transition-all active:scale-95 shadow-lg"
              >
                Book Pitch Now
              </button>
              <span className="text-xs text-white/80 font-medium hidden sm:inline-block">
                ⚡ Real-Time Dynamic Pricing Active
              </span>
            </div>
          </div>
        </section>

        {/* Stitch Sport Selection Cards Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline font-bold text-xl text-primary tracking-tight">Select Sport</h3>
            <span className="text-xs text-on-surface-variant font-medium">Showing active sports courts</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {availableSports.map(s => {
              const isSelected = selectedSport?.id === s.id;
              const key = s.name.toLowerCase();
              const meta = sportImages[key] || {
                img: 'https://images.unsplash.com/photo-1517649763962-0c623266010b?auto=format&fit=crop&w=600&q=80',
                subtitle: 'Professional Facilities',
                courts: 'Multiple Courts'
              };

              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSport(s)}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 shadow-md translate-y-[-2px]'
                      : 'border-outline-variant/50 hover:border-primary/50 hover:shadow-sm'
                  }`}
                >
                  <div className="h-28 w-full relative overflow-hidden">
                    <img
                      src={meta.img}
                      alt={s.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className={`absolute inset-0 transition-opacity ${isSelected ? 'bg-primary/40' : 'bg-black/35 group-hover:bg-black/20'}`} />
                    <div className="absolute top-2 left-2 text-xl bg-white/90 backdrop-blur-xs p-1 rounded-xl shadow-xs">
                      {s.icon}
                    </div>
                  </div>

                  <div className="p-3 bg-white space-y-0.5">
                    <h4 className="font-headline font-bold text-sm text-on-surface flex items-center justify-between">
                      <span>{s.name}</span>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant font-medium line-clamp-1">{meta.subtitle}</p>
                    <p className="text-[10px] text-primary font-bold pt-1">{meta.courts}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Available Pitch & Courts Section */}
        <section id="court-selection" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-headline font-bold text-xl text-primary tracking-tight">Available Pitch & Courts</h3>
              <p className="text-xs text-on-surface-variant font-medium mt-0.5">Select a court pitch to view real-time available time slots</p>
            </div>
            <span className="text-xs text-primary font-bold bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              {availableCourts.length} Pitch{availableCourts.length !== 1 ? 'es' : ''} Configured
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {availableCourts.map(c => {
              const isSelected = selectedCourt?.id === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCourt(c);
                    setSelectedSlots([]);
                  }}
                  className={`p-5 rounded-3xl cursor-pointer transition-all duration-300 border space-y-3.5 bg-white relative ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 shadow-md translate-y-[-2px]'
                      : 'border-outline-variant/60 hover:border-primary/50 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                        {c.slot_duration_minutes} MIN SESSIONS
                      </span>
                      <h4 className="font-headline font-bold text-base text-on-surface mt-2 leading-tight">
                        {c.name}
                      </h4>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        ✓
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1 border-t border-outline-variant/30">
                    <span className="flex items-center gap-1 font-medium">
                      ⏰ {c.opening_time} - {c.closing_time}
                    </span>
                    <span className="font-headline font-extrabold text-primary text-sm">
                      ₹{c.base_price_per_hour} <span className="text-[10px] font-normal text-on-surface-variant">/hr</span>
                    </span>
                  </div>

                  {c.peak_enabled && (
                    <div className="text-[11px] text-amber-900 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/80 flex items-center justify-between font-medium">
                      <span>🔥 Evening Peak ({c.peak_start_time}-{c.peak_end_time})</span>
                      <strong className="font-extrabold">₹{c.peak_price_per_hour}/hr</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Stitch Quick Filter & 14-Day Date Strip */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-sm text-primary">Quick Date Filter:</span>
              <div className="flex gap-1.5 bg-surface-container-low p-1 rounded-2xl text-xs font-headline font-bold">
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'tomorrow', label: 'Tomorrow' },
                  { id: 'weekend', label: 'This Weekend' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFilterClick(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      activeFilter === f.id
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-on-surface-variant font-semibold">
              Selected Date: <span className="text-primary font-headline font-bold">{selectedDate}</span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {dateStrip.map(d => {
              const isSelected = selectedDate === d.iso;
              return (
                <button
                  key={d.iso}
                  onClick={() => {
                    setSelectedDate(d.iso);
                    setActiveFilter('all');
                    setSelectedSlots([]);
                  }}
                  className={`min-w-[72px] p-3 rounded-2xl text-center font-headline transition-all border flex flex-col items-center justify-center gap-0.5 ${
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-md scale-105'
                      : 'bg-white text-on-surface-variant hover:border-primary/40 border-outline-variant/40 hover:bg-surface-container-low'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-80">{d.dayName}</span>
                  <span className="text-xl font-extrabold">{d.dayNum}</span>
                  <span className="text-[10px] opacity-80">{d.monthName}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Slot Grid Container */}
        {selectedCourt && (
          <section className="bg-white rounded-3xl p-6 border border-outline-variant/50 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/40 pb-4">
              <div>
                <h3 className="font-headline font-bold text-xl text-primary flex items-center gap-2">
                  <span>Available Time Slots</span>
                  <span className="text-xs font-normal text-on-surface-variant bg-surface-container-low px-2.5 py-0.5 rounded-full border border-outline-variant/40">
                    {selectedCourt.slot_duration_minutes} Min Sessions
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                  Click available slots to reserve with real-time Redis locking
                </p>
              </div>
            </div>

            <SlotGrid
              slots={computedSlots}
              selectedSlots={selectedSlots}
              onToggleSlot={handleToggleSlot}
            />
          </section>
        )}

        {/* Footer */}
        <footer className="pt-8 pb-4 border-t border-outline-variant/30 text-xs text-on-surface-variant flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 {venue.name}. High Performance Sports Venues.</p>
          <button
            onClick={onSwitchToAdmin}
            className="text-on-surface-variant/70 hover:text-primary transition-colors text-[11px] font-medium underline flex items-center gap-1"
          >
            Staff / Manager Portal Access
          </button>
        </footer>
      </main>

      {/* Stitch Sticky Bottom Bar */}
      {selectedSlots.length > 0 && selectedCourt && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-outline-variant/60 p-4 z-50 shadow-2xl animate-modalScaleIn">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between">
            <div>
              <span className="bg-secondary-container text-on-secondary-container px-2.5 py-0.5 rounded-full font-headline font-bold text-xs inline-block mb-1">
                {selectedSlots.length} Slot(s) Held
              </span>
              <p className="text-sm font-bold text-on-surface">
                {formatTimeRange12h(selectedSlots[0]?.start_time, selectedSlots[selectedSlots.length - 1]?.end_time)} | {selectedDate}
              </p>
              <p className="text-2xl font-headline font-extrabold text-primary mt-0.5">₹{totalPrice}</p>
            </div>

            <button
              onClick={handleProceedCheckout}
              className="btn-cta text-sm px-8 py-3.5 font-headline font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg"
            >
              Proceed to Checkout <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Customer Auth Modal (Login / Register) */}
      {showAuthModal && (
        <CustomerAuthModal
          onSuccess={(customer) => {
            setCurrentCustomer(customer);
            setShowAuthModal(false);
            if (selectedSlots.length > 0) {
              setShowCheckout(true);
            }
          }}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Checkout Modal */}
      {showCheckout && selectedCourt && (
        <CheckoutModal
          court={selectedCourt}
          dateStr={selectedDate}
          selectedSlots={selectedSlots}
          sessionId={sessionId}
          currentCustomer={currentCustomer}
          onClose={() => setShowCheckout(false)}
          onSuccess={(ref) => {
            setShowCheckout(false);
            setSelectedSlots([]);
            setConfirmedBookingRef(ref);
            refreshSlots();
          }}
        />
      )}

      {confirmedBookingRef && (
        <BookingConfirmationModal
          bookingRef={confirmedBookingRef}
          onClose={() => setConfirmedBookingRef(null)}
        />
      )}

      {showLookup && currentCustomer && (
        <BookingLookupModal
          currentCustomer={currentCustomer}
          onClose={() => setShowLookup(false)}
        />
      )}

      {selectedHoldSlot && (
        <ActiveCustomerHoldModal
          court={selectedHoldSlot.court}
          date={selectedHoldSlot.date}
          time={selectedHoldSlot.time}
          onClose={() => setSelectedHoldSlot(null)}
        />
      )}
    </div>
  );
};
