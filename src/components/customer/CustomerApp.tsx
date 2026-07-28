import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { Sport, Court, DynamicSlot } from '../../types/schema';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { SlotGrid } from './SlotGrid';
import { CheckoutModal } from './CheckoutModal';
import { BookingConfirmationModal } from './BookingConfirmationModal';
import { BookingLookupModal } from './BookingLookupModal';
import { Trophy, Calendar, MapPin, ShieldCheck, UserCheck, Search, ChevronRight, Lock, Zap, Star, Clock, CheckCircle2 } from 'lucide-react';

interface CustomerAppProps {
  onSwitchToAdmin: () => void;
}

export const CustomerApp: React.FC<CustomerAppProps> = ({ onSwitchToAdmin }) => {
  const venue = store.getVenue();
  const sports = store.getSports();

  const [selectedSport, setSelectedSport] = useState<Sport>(sports[0]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);

  // Date strip setup (next 14 days)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const dateStrip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
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

  const [computedSlots, setComputedSlots] = useState<DynamicSlot[]>([]);

  const availableCourts = store.getCourts().filter(
    c => c.status === 'active' && c.sport_ids.includes(selectedSport.id)
  );

  useEffect(() => {
    if (availableCourts.length > 0 && (!selectedCourt || !selectedCourt.sport_ids.includes(selectedSport.id))) {
      setSelectedCourt(availableCourts[0]);
    }
  }, [selectedSport]);

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
        alert(lockRes.message);
      }
    }
  };

  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="min-h-screen text-slate-100 pb-28">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#070b15]/85 backdrop-blur-xl border-b border-white/10 px-4 py-3 shadow-2xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/30 text-slate-950">
              ⚽
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg text-white tracking-tight">{venue.name}</h1>
                <span className="badge-neon badge-neon-emerald text-[9px] px-2 py-0.5">
                  🟢 Open Now
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" /> HSR Layout, Bengaluru • 4.9 ★ Rating
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLookup(true)}
              className="btn-glass px-3.5 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-emerald-400" /> My Bookings
            </button>
            <button
              onClick={onSwitchToAdmin}
              className="btn-emerald px-4 py-1.5 text-xs flex items-center gap-1.5 font-bold"
            >
              <UserCheck className="w-3.5 h-3.5" /> Admin Panel
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-emerald-950/30 via-slate-900/60 to-transparent py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 fill-emerald-400" /> Instant Turf Booking Engine
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Reserve Your Pitch in Seconds
            </h2>
            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
              Real-time slot locking, instant Razorpay payment checkout, and immediate WhatsApp confirmation. Zero double bookings guaranteed.
            </p>
          </div>

          {/* Quick Info Badges */}
          <div className="flex flex-wrap md:flex-col gap-2.5 text-xs text-slate-300 bg-slate-900/80 p-4 rounded-2xl border border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Layer-2 DB Conflict Guard</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              <span>5-Min Redis Slot Hold</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Instant WhatsApp Receipt</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* STEP 1: Sport Selection */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">1</span>
              Choose Sport
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sports.map(sport => {
              const isActive = selectedSport.id === sport.id;
              return (
                <button
                  key={sport.id}
                  onClick={() => setSelectedSport(sport)}
                  className={`glass-card glass-card-interactive p-4 text-left transition-all ${
                    isActive
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/60 to-slate-900 shadow-lg shadow-emerald-500/20'
                      : 'hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{sport.icon}</span>
                    {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow"></span>}
                  </div>
                  <h4 className="font-extrabold text-base text-white mt-3">{sport.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">FIFA Certified Courts</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Court Selection */}
        {availableCourts.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">2</span>
              Select Court
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableCourts.map(court => {
                const isSelected = selectedCourt?.id === court.id;
                return (
                  <button
                    key={court.id}
                    onClick={() => setSelectedCourt(court)}
                    className={`glass-card glass-card-interactive p-5 text-left transition-all relative overflow-hidden ${
                      isSelected
                        ? 'border-emerald-500 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30'
                        : 'hover:border-slate-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">
                          Premium Field
                        </span>
                        <h4 className="font-black text-lg text-white mt-0.5">{court.name}</h4>
                      </div>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-xl text-xs font-extrabold">
                        ₹{court.base_price_per_hour}/hr
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" /> {court.slot_duration_minutes} min slots
                      </span>
                      <span className="flex items-center gap-1.5">
                        🔄 {court.buffer_minutes}m turnover buffer
                      </span>
                      <span className="flex items-center gap-1.5">
                        ⭐ 4.9 (120+ reviews)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: Date Picker Strip */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">3</span>
              Select Date
            </h3>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              📅 Selected: {selectedDate}
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
                  className={`flex flex-col items-center justify-center p-3 min-w-[76px] rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-300 text-slate-950 font-black shadow-lg shadow-emerald-500/30 transform scale-105'
                      : 'glass-card text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold opacity-80">{d.dayName}</span>
                  <span className="text-lg font-black my-0.5">{d.dayNum}</span>
                  <span className="text-[10px] opacity-75 font-semibold">{d.monthName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 4: Slot Grid */}
        {selectedCourt && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">4</span>
                Select Slots for {selectedCourt.name}
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-glow"></span> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Locked</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Booked</span>
              </div>
            </div>

            <SlotGrid
              slots={computedSlots}
              selectedSlots={selectedSlots}
              onToggleSlot={handleToggleSlot}
            />
          </div>
        )}
      </main>

      {/* Sticky Bottom Bar */}
      {selectedSlots.length > 0 && selectedCourt && (
        <div className="fixed bottom-0 inset-x-0 bg-[#070b15]/95 backdrop-blur-2xl border-t border-white/10 p-4 z-50 shadow-2xl animate-modalScaleIn">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <span className="badge-neon badge-neon-emerald text-[9px] px-2 py-0.5 mb-1">
                {selectedSlots.length} Slot(s) Selected
              </span>
              <p className="text-sm font-bold text-white">
                {selectedSlots[0]?.start_time} – {selectedSlots[selectedSlots.length - 1]?.end_time} | {selectedDate}
              </p>
              <p className="text-2xl font-black text-emerald-400 mt-0.5">₹{totalPrice}</p>
            </div>

            <button
              onClick={() => setShowCheckout(true)}
              className="btn-emerald text-sm px-7 py-3.5 font-black shadow-xl shadow-emerald-500/30 flex items-center gap-2"
            >
              Continue to Payment <ChevronRight className="w-5 h-5" />
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
    </div>
  );
};
