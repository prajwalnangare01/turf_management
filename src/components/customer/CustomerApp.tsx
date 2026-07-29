import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { Sport, Court, DynamicSlot } from '../../types/schema';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { SlotGrid } from './SlotGrid';
import { CheckoutModal } from './CheckoutModal';
import { BookingConfirmationModal } from './BookingConfirmationModal';
import { BookingLookupModal } from './BookingLookupModal';
import { ActiveCustomerHoldModal } from '../common/ActiveCustomerHoldModal';
import { formatTimeRange12h } from '../../utils/formatters';
import { ChevronRight, Search, UserCheck } from 'lucide-react';

interface CustomerAppProps {
  onSwitchToAdmin: () => void;
}

export const CustomerApp: React.FC<CustomerAppProps> = ({ onSwitchToAdmin }) => {
  const venue = store.getVenue();
  const allSports = store.getSports();
  const allCourts = store.getCourts();

  // Filter sports to only those that have active courts configured at this venue
  const activeCourts = allCourts.filter(c => c.status === 'active');
  const sports = allSports.filter(s => activeCourts.some(c => c.sport_ids.includes(s.id)));
  const availableSports = sports.length > 0 ? sports : allSports;

  const [selectedSport, setSelectedSport] = useState<Sport>(availableSports[0]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);

  // Quick filter state
  const [activeFilter, setActiveFilter] = useState<'today' | 'tomorrow' | 'weekend' | 'all'>('today');

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

  return (
    <div className="bg-background text-on-surface min-h-screen pb-28">
      {/* Stitch TopAppBar Header */}
      <header className="sticky top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm flex items-center justify-between px- margin-desktop max-w-[1200px] mx-auto h-16 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined" style={{ fontSize: '26px' }}>sports_soccer</span>
          </div>
          <div>
            <h1 className="font-headline font-bold text-2xl text-primary leading-none tracking-tight">
              {venue.name}
            </h1>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-xs" style={{ fontSize: '14px' }}>location_on</span>
              HSR Layout, Bengaluru • 4.9 ★ Rating
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLookup(true)}
            className="btn-primary px-4 py-2 text-xs font-headline font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Search className="w-3.5 h-3.5 text-white" /> Find My Booking
          </button>
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

        {/* STEP 1: Select Your Sport (Stitch Bento Cards) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-extrabold">1</span>
              Select Your Sport
            </h3>
            <span className="text-xs font-semibold text-on-surface-variant">
              Showing courts for {selectedSport.name}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {availableSports.map(sport => {
              const isActive = selectedSport?.id === sport.id;
              const courtCount = activeCourts.filter(c => c.sport_ids.includes(sport.id)).length;
              const courtsLabel = `${courtCount} Court${courtCount === 1 ? '' : 's'} Available`;

              const meta = sportImages[sport.id] || {
                img: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=600&q=80',
                subtitle: 'Professional Arenas',
              };

              return (
                <div
                  key={sport.id}
                  onClick={() => setSelectedSport(sport)}
                  className={`group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border flex flex-col aspect-[4/5] ${
                    isActive ? 'border-2 border-primary ring-2 ring-primary/20' : 'border-outline-variant/50'
                  }`}
                >
                  <div className="h-1/2 overflow-hidden relative">
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors z-10"></div>
                    <img
                      src={meta.img}
                      alt={sport.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 right-2 bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-md font-headline font-bold text-[10px] z-20 shadow-sm">
                      {courtsLabel}
                    </div>
                  </div>
                  <div className="p-3 flex flex-col flex-1 justify-between bg-white">
                    <div>
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-1.5">
                        <span className="text-lg">{sport.icon}</span>
                      </div>
                      <h4 className="font-headline font-bold text-lg text-on-surface leading-snug">{sport.name}</h4>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-medium">{meta.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* STEP 2: Court Selection Cards */}
        {availableCourts.length > 0 && (
          <section id="court-selection">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-2xl font-bold text-on-surface flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-extrabold">2</span>
                Select Arena & Pitch
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableCourts.map(court => {
                const isSelected = selectedCourt?.id === court.id;
                return (
                  <div
                    key={court.id}
                    onClick={() => setSelectedCourt(court)}
                    className={`bg-white rounded-xl p-5 cursor-pointer border transition-all relative overflow-hidden shadow-sm hover:shadow-md ${
                      isSelected
                        ? 'border-2 border-primary ring-2 ring-primary/20 bg-surface-container-low'
                        : 'border-outline-variant/60'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-headline font-bold text-[11px] uppercase tracking-wider inline-block mb-1">
                          FIFA Standard Surface
                        </span>
                        <h4 className="font-headline font-bold text-xl text-on-surface">{court.name}</h4>
                      </div>
                      <div className="text-right">
                        <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-lg font-headline font-bold text-sm inline-block shadow-sm">
                          ₹{court.base_price_per_hour}/hr
                        </span>
                        <span className="block text-[11px] text-on-surface-variant mt-1">Base Hourly Rate</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-outline-variant/30 text-xs text-on-surface-variant flex items-center justify-between">
                      <span className="flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-primary text-base">schedule</span> {court.slot_duration_minutes}m Slot Duration
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-primary text-base">published_with_changes</span> {court.buffer_minutes}m Buffer
                      </span>
                      <span className="flex items-center gap-1 font-medium text-amber-700">
                        ⭐ 4.9 (140+ reviews)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* STEP 3: Date Picker Strip */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-extrabold">3</span>
              Select Booking Date
            </h3>
            <span className="text-xs text-primary font-headline font-bold bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              Selected: {selectedDate}
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-3 scrollbar-none">
            {dateStrip.map(d => {
              const isSelected = selectedDate === d.iso;
              return (
                <button
                  key={d.iso}
                  onClick={() => {
                    setSelectedDate(d.iso);
                    setSelectedSlots([]);
                  }}
                  className={`flex flex-col items-center justify-center p-3 min-w-[80px] rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-primary border-primary text-white font-bold shadow-md transform scale-105'
                      : 'bg-white text-on-surface border-outline-variant/60 hover:border-primary'
                  }`}
                >
                  <span className={`text-[11px] uppercase font-headline font-bold ${isSelected ? 'text-white' : 'text-on-surface-variant'}`}>{d.dayName}</span>
                  <span className="text-xl font-headline font-extrabold my-0.5">{d.dayNum}</span>
                  <span className="text-[10px] opacity-80 font-medium">{d.monthName}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* STEP 4: Time Slot Picker Grid */}
        {selectedCourt && (
          <section className="bg-white rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-outline-variant/30">
              <div>
                <h3 className="font-headline text-2xl font-bold text-on-surface flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-extrabold">4</span>
                  Select Time Slots for {selectedCourt.name}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Click on available slots to hold them for your booking session.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant font-medium">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-white border border-outline-variant"></span> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-secondary-container"></span> Selected</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-200 border border-sky-400"></span> Locked</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></span> Booked</span>
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
              onClick={() => setShowCheckout(true)}
              className="btn-cta text-sm px-8 py-3.5 font-headline font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg"
            >
              Proceed to Checkout <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCheckout && selectedCourt && (
        <CheckoutModal
          court={selectedCourt}
          dateStr={selectedDate}
          selectedSlots={selectedSlots}
          sessionId={sessionId}
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

      {showLookup && (
        <BookingLookupModal onClose={() => setShowLookup(false)} />
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
