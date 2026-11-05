import React from 'react';
import { store } from '../../services/store';

interface Props {
  onSwitchToAdmin: () => void;
}

export const WhatsAppOnlyLanding: React.FC<Props> = ({ onSwitchToAdmin }) => {
  const venue = store.getVenue();
  const courts = store.getCourts();
  const sports = store.getSports();

  const cleanPhone = (venue.contact_phone || '919876543210').replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hi! I would like to book a slot at ' + venue.name)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xl">
            ⚽
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">{venue.name}</h1>
            <p className="text-xs text-slate-400">Official Sports Arena</p>
          </div>
        </div>
        <button
          onClick={onSwitchToAdmin}
          className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          Staff & Admin Portal →
        </button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold mb-6 animate-pulse">
          <span>⚡ Instant 30-Second WhatsApp Booking</span>
        </div>

        <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4 leading-tight">
          Book Your Turf on <span className="text-emerald-400">WhatsApp</span>
        </h2>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
          Skip the forms. Chat directly with our 24/7 AI Booking Assistant to check live slot availability, get instant UPI payment passes, and manage match reservations.
        </p>

        {/* Primary CTA */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold px-8 py-4 rounded-2xl text-base shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <span className="text-2xl">💬</span>
          <span>Start Booking on WhatsApp</span>
        </a>
        <p className="text-xs text-slate-500 mt-3 font-mono">
          Or message us directly at {venue.contact_phone}
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full text-left">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-2xl block mb-2">⚡</span>
            <h3 className="text-sm font-bold text-white mb-1">Live Dynamic Slots</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Check real-time availability for Football, Cricket & Badminton in one message.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-2xl block mb-2">🔒</span>
            <h3 className="text-sm font-bold text-white mb-1">Zero Double-Bookings</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              5-minute checkout holds guard your slot while you complete your UPI payment.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-2xl block mb-2">🎟️</span>
            <h3 className="text-sm font-bold text-white mb-1">Instant Pass & Maps</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Receive your confirmed match pass, Google Maps pin, and rules ticket right in WhatsApp.
            </p>
          </div>
        </div>

        {/* Sports Available Strip */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 w-full flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <span className="text-slate-500 uppercase tracking-wider font-semibold text-[10px]">Active Sports:</span>
          {sports.map(s => (
            <span key={s.id} className="flex items-center gap-1.5 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              <span>{s.icon}</span>
              <span className="text-slate-300 font-medium">{s.name}</span>
            </span>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-600">
        {venue.name} • {venue.address} • Powered by TurfFlow
      </footer>
    </div>
  );
};
