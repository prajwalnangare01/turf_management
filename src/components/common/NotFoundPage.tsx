import React from 'react';
import { Trophy, ArrowLeft, Home, Phone, Compass } from 'lucide-react';
import { store } from '../../services/store';

interface NotFoundPageProps {
  onNavigateHome: () => void;
  onSwitchToAdmin?: () => void;
  onNavigateToPolicies?: (section?: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onNavigateHome,
  onNavigateToPolicies
}) => {
  const venue = store.getVenue();
  const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';

  return (
    <div className="bg-[#f8fafc] text-on-surface min-h-screen flex flex-col justify-between selection:bg-primary/20">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-xs px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2 group cursor-pointer text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition-transform">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <span className="font-headline font-black text-xs sm:text-sm text-primary tracking-tight block leading-tight">
                {venue.name || 'TurfFlow Arena'}
              </span>
              <span className="text-[9.5px] text-on-surface-variant font-medium">Online Pitch Booking</span>
            </div>
          </button>

          <button
            onClick={onNavigateHome}
            className="btn-secondary text-xs px-3 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-1.5 font-bold hover:shadow-xs cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-primary" />
            <span>Go to Home</span>
          </button>
        </div>
      </header>

      {/* Main 404 Hero Container */}
      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-16 flex-1 flex flex-col items-center justify-center text-center">
        {/* Animated Visual 404 Badge */}
        <div className="relative mb-4 sm:mb-6">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-emerald-100/80 border-4 border-emerald-300/60 flex items-center justify-center shadow-lg mx-auto relative overflow-hidden">
            <span className="text-4xl sm:text-6xl select-none animate-bounce">🏟️</span>
          </div>
          <span className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 bg-primary text-white font-mono font-black text-xs sm:text-sm px-3.5 py-1 rounded-full shadow-md tracking-widest border-2 border-white">
            ERROR 404
          </span>
        </div>

        {/* Headlines */}
        <div className="space-y-2 max-w-lg mb-6 sm:mb-8">
          <h1 className="font-headline font-black text-2xl sm:text-4xl text-primary tracking-tight">
            Offside! Page Not Found
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed font-medium">
            The match link, pitch URL, or page you are looking for has moved, expired, or does not exist on this venue.
          </p>

          {currentPath && (
            <div className="inline-block bg-surface-container-low border border-outline-variant/40 px-3 py-1 rounded-xl text-[10.5px] font-mono text-on-surface-variant mt-2 max-w-full truncate">
              Attempted URL: <span className="text-primary font-bold">{currentPath}</span>
            </div>
          )}
        </div>

        {/* Primary Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
          <button
            onClick={onNavigateHome}
            className="btn-cta py-3 px-5 text-xs sm:text-sm font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer rounded-2xl"
          >
            <Home className="w-4 h-4" />
            <span>Book a Pitch Slot</span>
          </button>

          {onNavigateToPolicies ? (
            <button
              onClick={() => onNavigateToPolicies('helpline')}
              className="btn-secondary py-3 px-5 text-xs sm:text-sm font-headline font-bold flex items-center justify-center gap-2 rounded-2xl cursor-pointer"
            >
              <Phone className="w-4 h-4 text-primary" />
              <span>Owner Helpline &amp; Info</span>
            </button>
          ) : (
            <button
              onClick={onNavigateHome}
              className="btn-secondary py-3 px-5 text-xs sm:text-sm font-headline font-bold flex items-center justify-center gap-2 rounded-2xl cursor-pointer"
            >
              <Compass className="w-4 h-4 text-primary" />
              <span>View Venue Directory</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-outline-variant/30 py-4 px-4 text-center text-xs text-on-surface-variant bg-white/60">
        <p className="font-medium">
          {venue.name || 'TurfFlow Arena'} • Helpline: {venue.contact_phone || '+91 95791 58374'}
        </p>
      </footer>
    </div>
  );
};
