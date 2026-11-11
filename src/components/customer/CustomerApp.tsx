import React, { useState, useEffect, useRef, useCallback } from 'react';
import { store } from '../../services/store';
import { Sport, Court, DynamicSlot, Customer } from '../../types/schema';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { CustomerAuthService } from '../../services/customerAuthService';
import { CustomerAuthModal } from './CustomerAuthModal';
import { CustomerProfilePage } from './CustomerProfilePage';
import { VenueInfoAndPoliciesPage, PolicySection } from './VenueInfoAndPoliciesPage';
import { TurfSelectionCard } from './TurfSelectionCard';
import { HoldSummaryBar } from './HoldSummaryBar';
import { Footer } from '../common/Footer';
import { SlotGrid } from './SlotGrid';
import { CheckoutModal } from './CheckoutModal';
import { BookingConfirmationModal } from './BookingConfirmationModal';
import { BookingLookupModal } from './BookingLookupModal';
import { ActiveCustomerHoldModal } from '../common/ActiveCustomerHoldModal';
import { formatTimeRange12h, formatTime12hPlain, formatTimeRange12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';
import { DEFAULT_SPORT_FALLBACK_IMAGE } from '../../utils/imageUpload';
import { CustomerPortalSkeleton, PitchGridSkeleton, SportCardsSkeleton } from '../common/SkeletonLoaders';
import { ChevronRight, Search, UserCheck, User, LogOut, ShieldCheck, Clock, Calendar, Lock, MapPin, Phone, FileText, RotateCcw, X } from 'lucide-react';

interface CustomerAppProps {
  onSwitchToAdmin: () => void;
}

export const CustomerApp: React.FC<CustomerAppProps> = ({ onSwitchToAdmin }) => {
  const [, setStoreVersion] = useState(0);
  const venue = store.getVenue();
  const [allSports, setAllSports] = useState<Sport[]>(() => store.getSports());
  const [allCourts, setAllCourts] = useState<Court[]>(() => store.getCourts());

  // Listen to store updates for live dynamic sports & pitches synchronization
  useEffect(() => {
    const handleStoreChange = () => {
      setAllSports([...store.getSports()]);
      setAllCourts([...store.getCourts()]);
    };
    const unsubscribe = store.subscribe(handleStoreChange);
    window.addEventListener('turfflow_store_synced', handleStoreChange);
    return () => {
      unsubscribe();
      window.removeEventListener('turfflow_store_synced', handleStoreChange);
    };
  }, []);

  // Skeleton loading states for perceived high speed & zero content flash
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  // View state: 'booking' vs 'profile' vs 'policies'
  const [customerView, setCustomerView] = useState<'booking' | 'profile' | 'policies'>('booking');
  const [initialPolicySection, setInitialPolicySection] = useState<PolicySection>('helpline');

  // Filter sports to only those that have active courts configured at this venue
  const activeCourts = allCourts.filter(c => c.status === 'active');
  const sports = allSports.filter(s =>
    activeCourts.some(
      c =>
        c.sport_ids.includes(s.id) ||
        c.sport_ids.some(
          id => id.toLowerCase() === s.id.toLowerCase() || id.toLowerCase().includes(s.name.toLowerCase())
        )
    )
  );
  const availableSports = (sports.length > 0 ? sports : allSports).slice().sort((a, b) => {
    const ordA = typeof a.display_order === 'number' ? a.display_order : allSports.findIndex(as => as.id === a.id);
    const ordB = typeof b.display_order === 'number' ? b.display_order : allSports.findIndex(as => as.id === b.id);
    if (ordA !== -1 && ordB !== -1) return ordA - ordB;
    if (ordA !== -1) return -1;
    if (ordB !== -1) return 1;
    return 0;
  });

  // Inactivity timeout notice & preserved state recovery
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(() => {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (storage && storage.getItem('turfflow_hold_timeout_refresh') === 'true') {
        return 'Your slot hold expired due to 5 minutes of inactivity. Selected slots have been deselected.';
      }
    } catch {}
    return null;
  });

  const getPreservedItem = (key: string) => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) return localStorage.getItem(key);
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return sessionStorage.getItem(key);
    } catch {}
    return null;
  };

  const preservedSportId = getPreservedItem('turfflow_preserved_sport');
  const preservedCourtId = getPreservedItem('turfflow_preserved_court');
  const preservedDate = getPreservedItem('turfflow_preserved_date');

  useEffect(() => {
    // Clean up preserved items after initial render without breaking React StrictMode
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('turfflow_hold_timeout_refresh');
        localStorage.removeItem('turfflow_preserved_sport');
        localStorage.removeItem('turfflow_preserved_court');
        localStorage.removeItem('turfflow_preserved_date');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('turfflow_hold_timeout_refresh');
        sessionStorage.removeItem('turfflow_preserved_sport');
        sessionStorage.removeItem('turfflow_preserved_court');
        sessionStorage.removeItem('turfflow_preserved_date');
      }
    } catch {}
  }, []);

  const [selectedSport, setSelectedSport] = useState<Sport>(() => {
    if (preservedSportId) {
      const match = availableSports.find(s => s.id === preservedSportId);
      if (match) return match;
    }
    return availableSports[0];
  });
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(() => {
    if (preservedCourtId) {
      const match = activeCourts.find(c => c.id === preservedCourtId);
      if (match) return match;
    }
    return null;
  });

  // Synchronize selectedSport whenever availableSports change
  useEffect(() => {
    if (availableSports.length > 0) {
      if (!selectedSport || !availableSports.some(s => s.id === selectedSport.id)) {
        setSelectedSport(availableSports[0]);
      }
    }
  }, [availableSports, selectedSport]);

  // Quick filter state
  const [activeFilter, setActiveFilter] = useState<'today' | 'tomorrow' | 'weekend' | 'all'>('today');

  // Customer authentication state
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(() => {
    return CustomerAuthService.getAuthenticatedCustomer();
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState<string | null>(null);
  const [pendingSlotToSelect, setPendingSlotToSelect] = useState<DynamicSlot | null>(null);

  // Date strip setup (next 14 days)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return preservedDate || todayStr;
  });

  const dateStrip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    return { iso, dayName, dayNum, monthName };
  });

  const [sessionId] = useState(() => {
    try {
      const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('turfflow_user_session_id') : null;
      if (stored) return stored;
      const newId = `sess_${Math.floor(Math.random() * 1000000)}`;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('turfflow_user_session_id', newId);
      }
      return newId;
    } catch {
      return `sess_${Math.floor(Math.random() * 1000000)}`;
    }
  });
  const effectiveSessionId = currentCustomer ? currentCustomer.id : sessionId;
  const [selectedSlots, setSelectedSlots] = useState<DynamicSlot[]>([]);
  const selectedSlotsRef = React.useRef<DynamicSlot[]>([]);
  const showCheckoutRef = React.useRef<boolean>(false);
  selectedSlotsRef.current = selectedSlots;

  // Automatically release held slots when the user refreshes or closes the page.
  // Resolves the corner case where a user holds a slot, refreshes, and finds their own slot stuck as held for 5 minutes.
  useEffect(() => {
    const storedSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('turfflow_user_session_id') : null;

    // 1. Immediately on page mount / refresh: clean up any dangling locks from prior page load
    if (storedSession) {
      RedisLockService.releaseAllLocksForSession(storedSession);
    }
    if (effectiveSessionId) {
      RedisLockService.releaseAllLocksForSession(effectiveSessionId);
    }
    if (currentCustomer?.id) {
      RedisLockService.releaseAllLocksForSession(currentCustomer.id);
    }
    refreshSlots();

    // 2. Synchronously on window beforeunload & pagehide when user reloads or navigates away
    const handleUnload = () => {
      if (storedSession) {
        RedisLockService.releaseAllLocksForSession(storedSession);
      }
      if (effectiveSessionId) {
        RedisLockService.releaseAllLocksForSession(effectiveSessionId);
      }
      if (currentCustomer?.id) {
        RedisLockService.releaseAllLocksForSession(currentCustomer.id);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [effectiveSessionId, currentCustomer?.id]);

  // Modals
  const [showCheckout, setShowCheckout] = useState(false);
  showCheckoutRef.current = showCheckout;
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
      const slots = SlotEngine.computeSlotsForCourt(selectedCourt, selectedDate, effectiveSessionId);
      setComputedSlots(slots);
    }
  };

  useEffect(() => {
    refreshSlots();
    const unsubscribe = store.subscribe(() => {
      if (selectedSlotsRef.current.length === 0 && !showCheckoutRef.current) {
        const tabSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('turfflow_user_session_id') : null;
        const hasDanglingTabLock = tabSession && store.getSlotLocks().some(l => l.locked_by === tabSession);
        if (hasDanglingTabLock && tabSession) {
          RedisLockService.releaseAllLocksForSession(tabSession);
          return;
        }
      }
      setStoreVersion(v => v + 1);
      refreshSlots();
    });
    const interval = setInterval(refreshSlots, 3000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [selectedCourt, selectedDate, effectiveSessionId]);

  // When switching date, pitch or sport, trigger brief skeleton animation for instant responsive feedback
  useEffect(() => {
    setIsSlotsLoading(true);
    const timer = setTimeout(() => {
      setIsSlotsLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedDate, selectedCourt?.id, selectedSport?.id]);

  // CC-S03: Recover from Mobile UPI external app intent switch on tab resume
  useEffect(() => {
    const handleCheckPendingCheckout = () => {
      if (typeof sessionStorage === 'undefined') return;
      const raw = sessionStorage.getItem('turfflow_pending_checkout');
      if (!raw) return;

      try {
        const pending = JSON.parse(raw);
        if (pending.expiresAt && Date.now() > pending.expiresAt) {
          sessionStorage.removeItem('turfflow_pending_checkout');
          return;
        }

        const booking = store.getBookings().find(
          b => b.booking_ref === pending.bookingRef || b.id === pending.bookingId
        );

        if (booking && booking.status === 'confirmed') {
          sessionStorage.removeItem('turfflow_pending_checkout');
          setShowCheckout(false);
          setSelectedSlots([]);
          setConfirmedBookingRef(booking.booking_ref);
        }
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleCheckPendingCheckout();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleCheckPendingCheckout);
    handleCheckPendingCheckout();

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleCheckPendingCheckout);
    };
  }, []);

  const handleToggleSlot = (slot: DynamicSlot) => {
    if (!selectedCourt) return;

    // If slot is currently locked by another customer, show Active Customer Hold Modal (no login required to view timer)
    if (slot.status === 'locked') {
      const isMyLock = slot.locked_by === effectiveSessionId || (!!currentCustomer && slot.locked_by === currentCustomer.id) || slot.locked_by === sessionId;
      if (!isMyLock) {
        setSelectedHoldSlot({ court: selectedCourt, date: selectedDate, time: slot.start_time });
        return;
      }
    }

    // EDGE CASE: Require Login / Signup before reserving or locking slots
    if (!currentCustomer) {
      setAuthPromptMessage('Please sign in or create an account to reserve and lock pitch slots.');
      setPendingSlotToSelect(slot);
      setShowAuthModal(true);
      return;
    }

    // EDGE CASE: Block suspended / blacklisted accounts from reserving slots
    if (currentCustomer.is_blacklisted) {
      alert(`Your account is currently suspended due to previous no-show violations. Online reservations are disabled. Please contact venue administration at ${venue.contact_phone}.`);
      return;
    }

    const exists = selectedSlots.some(s => s.start_time === slot.start_time);
    if (exists) {
      RedisLockService.releaseLock(selectedCourt.id, selectedDate, slot.start_time, effectiveSessionId);
      setSelectedSlots(selectedSlots.filter(s => s.start_time !== slot.start_time));
      refreshSlots();
    } else {
      const lockRes = RedisLockService.acquireLock(selectedCourt.id, selectedDate, slot.start_time, effectiveSessionId);
      if (lockRes.success) {
        setSelectedSlots([...selectedSlots, slot].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        refreshSlots();
      } else {
        setSelectedHoldSlot({ court: selectedCourt, date: selectedDate, time: slot.start_time });
      }
    }
  };

  const scrollToSection = (id: string, delay = 80) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, delay);
  };

  const releaseCurrentSelectionLocks = useCallback(() => {
    const slots = selectedSlotsRef.current;
    if (selectedCourt && slots.length > 0) {
      slots.forEach(s => {
        RedisLockService.releaseLock(selectedCourt.id, selectedDate, s.start_time, effectiveSessionId);
        if (sessionId !== effectiveSessionId) {
          RedisLockService.releaseLock(selectedCourt.id, selectedDate, s.start_time, sessionId);
        }
      });
    }
  }, [selectedCourt, selectedDate, effectiveSessionId, sessionId]);

  // 5-Minute Inactivity & Hold Expiration Handler:
  // Automatically releases locks, deselects slots, and refreshes the user site.
  const handleHoldExpired = useCallback(() => {
    if (selectedSlotsRef.current.length === 0) return;

    // 1. Release all locks for this session / customer
    releaseCurrentSelectionLocks();
    if (effectiveSessionId) {
      RedisLockService.releaseAllLocksForSession(effectiveSessionId);
    }
    if (sessionId && sessionId !== effectiveSessionId) {
      RedisLockService.releaseAllLocksForSession(sessionId);
    }
    if (currentCustomer?.id) {
      RedisLockService.releaseAllLocksForSession(currentCustomer.id);
    }

    // 2. Deselect slots and close any open checkout modal
    setSelectedSlots([]);
    setShowCheckout(false);

    // 3. Store refresh state in localStorage and sessionStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('turfflow_hold_timeout_refresh', 'true');
        if (selectedSport?.id) localStorage.setItem('turfflow_preserved_sport', selectedSport.id);
        if (selectedCourt?.id) localStorage.setItem('turfflow_preserved_court', selectedCourt.id);
        if (selectedDate) localStorage.setItem('turfflow_preserved_date', selectedDate);
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('turfflow_hold_timeout_refresh', 'true');
        if (selectedSport?.id) sessionStorage.setItem('turfflow_preserved_sport', selectedSport.id);
        if (selectedCourt?.id) sessionStorage.setItem('turfflow_preserved_court', selectedCourt.id);
        if (selectedDate) sessionStorage.setItem('turfflow_preserved_date', selectedDate);
      }
    } catch {}

    // 4. Refresh user site to deselect the slot
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
    } else {
      refreshSlots();
      setInactivityNotice('Your slot hold expired due to 5 minutes of inactivity. Selected slots have been deselected.');
    }
  }, [releaseCurrentSelectionLocks, effectiveSessionId, sessionId, currentCustomer?.id, selectedSport?.id, selectedCourt?.id, selectedDate]);

  // 5-Minute Inactivity & Hold Expiration Watchdog:
  // When user selects any slot and does not do anything for 5 minutes (or 5-minute hold expires),
  // refresh the user site to deselect the slot.
  const lastActivityTimeRef = useRef<number>(Date.now());
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    if (selectedSlots.length === 0) {
      return;
    }

    // Reset activity timer when slots are selected
    lastActivityTimeRef.current = Date.now();

    const updateActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'scroll', 'click'];
    events.forEach(ev => window.addEventListener(ev, updateActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityTimeRef.current;

      const firstLock = selectedCourt && selectedSlotsRef.current.length > 0
        ? RedisLockService.getLock(selectedCourt.id, selectedDate, selectedSlotsRef.current[0]?.start_time)
        : null;

      const isLockExpired = firstLock ? now >= firstLock.expires_at : false;
      const isIdle5Min = idleTime >= INACTIVITY_TIMEOUT_MS;

      if (isIdle5Min || isLockExpired) {
        clearInterval(checkInterval);
        handleHoldExpired();
      }
    }, 1000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, updateActivity));
      clearInterval(checkInterval);
    };
  }, [selectedSlots.length, selectedCourt?.id, selectedDate, effectiveSessionId, handleHoldExpired]);

  const handleSportSelect = (sport: Sport) => {
    if (selectedCourt && !selectedCourt.sport_ids.includes(sport.id)) {
      releaseCurrentSelectionLocks();
      setSelectedSlots([]);
    }
    setSelectedSport(sport);
    scrollToSection('pitch-selection');
  };

  const handleCourtSelect = (court: Court) => {
    if (selectedCourt && court.id !== selectedCourt.id) {
      releaseCurrentSelectionLocks();
    }
    setSelectedCourt(court);
    setSelectedSlots([]);
    scrollToSection('date-selection');
  };

  const handleDateStripSelect = (isoDate: string) => {
    if (selectedCourt && selectedSlots.length > 0) {
      selectedSlots.forEach(s => {
        RedisLockService.releaseLock(selectedCourt.id, selectedDate, s.start_time, effectiveSessionId);
      });
    }
    setSelectedDate(isoDate);
    setActiveFilter('all');
    setSelectedSlots([]);
    scrollToSection('slots-selection');
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
    // Release locks for previously selected slots on date switch
    if (selectedCourt && selectedSlots.length > 0) {
      selectedSlots.forEach(s => {
        RedisLockService.releaseLock(selectedCourt.id, selectedDate, s.start_time, effectiveSessionId);
      });
    }
    setSelectedSlots([]);
    scrollToSection('slots-selection');
  };

  const handleProceedCheckout = () => {
    if (!currentCustomer) {
      setAuthPromptMessage('Please sign in or create an account to proceed to checkout.');
      setShowAuthModal(true);
      return;
    }
    if (currentCustomer.is_blacklisted) {
      alert(`Your account is currently suspended due to previous no-show violations. Online reservations are disabled.`);
      return;
    }
    setShowCheckout(true);
  };

  const handleCustomerLogout = () => {
    if (currentCustomer && selectedCourt && selectedSlots.length > 0) {
      selectedSlots.forEach(s => {
        RedisLockService.releaseLock(selectedCourt.id, selectedDate, s.start_time, currentCustomer.id);
      });
    }
    setSelectedSlots([]);
    CustomerAuthService.logout();
    setCurrentCustomer(null);
    setCustomerView('booking');
    refreshSlots();
  };

  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);

  // Sport card image map matching Stitch mockups
  const sportImages: Record<string, { img: string; subtitle: string }> = {
    football: {
      img: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=600&q=80',
      subtitle: '5-a-side & 11-a-side'
    },
    cricket: {
      img: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Indoor Net & Turf Pitch'
    },
    badminton: {
      img: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80',
      subtitle: 'BWF Wooden Synthetic'
    },
    pickleball: {
      img: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Dedicated Acrylic Courts'
    },
    swimming: {
      img: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Olympic & Training Pools'
    },
    volleyball: {
      img: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Indoor & Sand Courts'
    },
    tennis: {
      img: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Clay & Hard Acrylic Courts'
    },
    basketball: {
      img: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Indoor High-Gloss Maple'
    },
    squash: {
      img: 'https://images.unsplash.com/photo-1558365849-6ebd8b0454b2?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Glass-Back Pro Courts'
    },
    padel: {
      img: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Panoramic Enclosed Courts'
    },
    kabaddi: {
      img: 'https://images.unsplash.com/photo-1517649763962-0c623266010b?auto=format&fit=crop&w=600&q=80',
      subtitle: 'Standard Pro Mat Arena'
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
        onNavigateToPolicies={(sec) => {
          if (sec) setInitialPolicySection(sec);
          setCustomerView('policies');
        }}
      />
    );
  }

  // If customer is viewing Venue Info & Policies page
  if (customerView === 'policies') {
    return (
      <VenueInfoAndPoliciesPage
        initialSection={initialPolicySection}
        onBackToBooking={() => setCustomerView('booking')}
      />
    );
  }

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col">
      {/* Stitch TopAppBar Header */}
      <header className="sticky top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm flex items-center justify-between max-w-[1200px] mx-auto min-h-16 px-3 sm:px-4 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <img
            src="/logo.png"
            alt="TurfFlow Logo"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-contain shadow-sm shrink-0 cursor-pointer p-0.5 bg-white border border-outline-variant/40"
            onClick={() => setCustomerView('booking')}
          />
          <div>
            <h1 className="font-headline font-bold text-lg sm:text-2xl text-primary leading-none tracking-tight cursor-pointer" onClick={() => setCustomerView('booking')}>
              {venue.name}
            </h1>
            <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium mt-0.5 hidden sm:flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Pune • 4.9 ★ Rating
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Owner Helpline & Policies Quick Access Button */}
          <button
            onClick={() => {
              setInitialPolicySection('helpline');
              setCustomerView('policies');
            }}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs font-headline font-bold border border-outline-variant/60 hover:border-primary/60 hover:bg-surface-container-low transition flex items-center gap-1.5 text-on-surface cursor-pointer shadow-2xs"
            title="Owner Helpline, Location & Policies"
          >
            <Phone className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Help & Policies</span>
          </button>

          {currentCustomer ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCustomerView(customerView === 'profile' ? 'booking' : 'profile')}
                className={`flex items-center gap-2.5 p-1 pr-3 sm:pr-4 rounded-full border transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer group ${
                  customerView === 'profile'
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-white hover:bg-surface-container-low border-outline-variant/60 text-on-surface hover:border-primary/60'
                }`}
                title="Account Profile & My Bookings"
              >
                {/* Circular Profile Avatar Option */}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold shadow-xs ring-2 ring-primary/20 group-hover:ring-primary/40 group-hover:scale-105 transition-all shrink-0">
                  <User className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
                </div>

                <div className="text-left flex flex-col justify-center pr-0.5">
                  <span className="font-headline font-bold text-xs sm:text-sm text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-[90px] xs:max-w-[120px] sm:max-w-[150px]">
                    {currentCustomer.name}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-medium leading-none mt-0.5 hidden xs:flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Profile & Bookings
                  </span>
                </div>
              </button>

              <button
                onClick={handleCustomerLogout}
                title="Sign Out"
                className="w-9 h-9 rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition border border-outline-variant/40 flex items-center justify-center cursor-pointer shadow-xs shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="btn-cta px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-headline font-bold flex items-center gap-2 shadow-sm rounded-full cursor-pointer hover:shadow-md transition-all"
            >
              <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>Sign Up / Login</span>
            </button>
          )}
        </div>
      </header>

      <main className={`flex-1 w-full max-w-[1200px] mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-6 sm:space-y-8 ${selectedSlots.length > 0 ? 'pb-28 sm:pb-32' : 'pb-10'}`}>
        {isInitialLoading && allCourts.length === 0 ? (
          <CustomerPortalSkeleton />
        ) : (
          <>
            {/* 5-Minute Inactivity Hold Timeout Notice */}
            {inactivityNotice && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs text-amber-950 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="text-xs font-medium">
                    <strong className="font-bold">Hold Timed Out:</strong> {inactivityNotice}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInactivityNotice(null)}
                  className="text-amber-800 hover:text-amber-950 p-1.5 rounded-lg hover:bg-amber-100 transition cursor-pointer shrink-0"
                  aria-label="Dismiss notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Blacklisted Account Warning Banner */}
        {currentCustomer?.is_blacklisted && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 md:p-5 flex items-start gap-3.5 shadow-sm text-red-950 animate-in fade-in">
            <div className="w-9 h-9 bg-red-100 text-red-700 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
              ⚠️
            </div>
            <div className="space-y-1">
              <h3 className="font-headline font-bold text-base text-red-900">
                Online Reservation Privileges Suspended
              </h3>
              <p className="text-xs text-red-800 leading-relaxed font-medium">
                Your customer account ({currentCustomer.phone}) has exceeded the venue no-show threshold ({currentCustomer.no_show_count} no-shows recorded). Online slot reservation is temporarily disabled. Please contact venue management at <strong>{venue.contact_phone}</strong> to resolve this hold.
              </p>
            </div>
          </div>
        )}


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
                img: DEFAULT_SPORT_FALLBACK_IMAGE,
                subtitle: 'Professional Facilities'
              };
              const cardImage = s.image_url || meta.img;
              const cardSubtitle = s.subtitle || meta.subtitle;
              const sportCourtCount = activeCourts.filter(c => c.sport_ids.includes(s.id)).length;
              const courtsLabel = `${sportCourtCount} Court${sportCourtCount === 1 ? '' : 's'} Available`;

              return (
                <div
                  key={s.id}
                  onClick={() => handleSportSelect(s)}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 shadow-md translate-y-[-2px]'
                      : 'border-outline-variant/50 hover:border-primary/50 hover:shadow-sm'
                  }`}
                >
                  <div className="h-28 w-full relative overflow-hidden">
                    <img
                      src={cardImage}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== DEFAULT_SPORT_FALLBACK_IMAGE) {
                          target.src = DEFAULT_SPORT_FALLBACK_IMAGE;
                        }
                      }}
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
                    <p className="text-[11px] text-on-surface-variant font-medium line-clamp-1">{cardSubtitle}</p>
                    <p className="text-[10px] text-primary font-bold pt-1">{courtsLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Available Pitch & Courts Section */}
        <section id="pitch-selection" className="space-y-4 pt-2 scroll-mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-headline font-bold text-xl text-primary tracking-tight">Available Pitch & Courts</h3>
              <p className="text-xs text-on-surface-variant font-medium mt-0.5">Select a court pitch to view real-time available time slots</p>
            </div>
            <span className="text-xs text-primary font-bold bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              {availableCourts.length} Pitch{availableCourts.length !== 1 ? 'es' : ''} Configured
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
            {availableCourts.length === 0 ? (
              <PitchGridSkeleton count={2} />
            ) : (
              availableCourts.map(c => {
                const isSelected = selectedCourt?.id === c.id;
                return (
                  <TurfSelectionCard
                    key={c.id}
                    court={c}
                    selectedDate={selectedDate}
                    isSelected={isSelected}
                    onSelect={() => handleCourtSelect(c)}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* Stitch Quick Filter & 14-Day Date Strip */}
        <section id="date-selection" className="space-y-4 scroll-mt-20">
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
              Selected Date: <span className="text-primary font-headline font-bold">{formatDateDDMMYYYY(selectedDate)}</span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {dateStrip.map(d => {
              const isSelected = selectedDate === d.iso;
              return (
                <button
                  key={d.iso}
                  onClick={() => handleDateStripSelect(d.iso)}
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
          {/* Advance Booking Note */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs bg-surface-container-low px-4 py-2.5 rounded-2xl border border-outline-variant/30 text-on-surface-variant">
            <span className="flex items-center gap-1.5 font-medium">
              <span>📅 Advance online booking is available up to 14 days.</span>
            </span>
            <span className="text-[11px] font-bold text-primary">
              Need to book next month or after 15 days? Contact Admin: <a href="tel:+919579158374" className="underline hover:text-primary-focus">+91 95791 58374</a>
            </span>
          </div>
        </section>

        {/* Slot Grid Container */}
        {selectedCourt && (
          <section id="slots-selection" className="bg-white rounded-3xl p-4 sm:p-6 border border-outline-variant/50 shadow-sm space-y-4 scroll-mt-20">
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
              isLoading={isSlotsLoading}
            />
          </section>
        )}
          </>
        )}
      </main>

      {/* Dark-themed High Performance Responsive Footer */}
      <Footer
        venueName={venue.name || 'TurfFlow Arena'}
        logoUrl="/logo.png"
        gstin={venue.gst_number || '29ABCDE1234F1Z5'}
        onNavigateToPolicies={(sec) => {
          if (sec) setInitialPolicySection(sec as any);
          setCustomerView('policies');
        }}
        onSwitchToAdmin={onSwitchToAdmin}
        hasActiveHold={selectedSlots.length > 0}
      />

      {/* Fixed-Bottom Summary Checkout Bar */}
      {selectedSlots.length > 0 && selectedCourt && (() => {
        const firstLock = RedisLockService.getLock(selectedCourt.id, selectedDate, selectedSlots[0]?.start_time);
        return (
          <HoldSummaryBar
            heldCount={selectedSlots.length}
            startTime={formatTime12hPlain(selectedSlots[0]?.start_time)}
            endTime={formatTime12hPlain(selectedSlots[selectedSlots.length - 1]?.end_time)}
            date={selectedDate}
            totalPrice={totalPrice}
            courtName={selectedCourt.name}
            expiresAt={firstLock?.expires_at}
            onProceed={handleProceedCheckout}
            onExpire={handleHoldExpired}
          />
        );
      })()}

      {/* Customer Auth Modal (Login / Register) */}
      {showAuthModal && (
        <CustomerAuthModal
          customNotice={authPromptMessage}
          onSuccess={(customer) => {
            setCurrentCustomer(customer);
            setShowAuthModal(false);
            setAuthPromptMessage(null);

            if (customer.is_blacklisted) {
              setPendingSlotToSelect(null);
              alert(`Welcome back ${customer.name}. Notice: Your account is currently suspended for online bookings due to past no-shows. Please contact venue administration.`);
              return;
            }

            if (pendingSlotToSelect && selectedCourt) {
              const target = pendingSlotToSelect;
              setPendingSlotToSelect(null);
              const lockRes = RedisLockService.acquireLock(selectedCourt.id, selectedDate, target.start_time, customer.id);
              if (lockRes.success) {
                setSelectedSlots([target]);
                refreshSlots();
              } else {
                setSelectedHoldSlot({ court: selectedCourt, date: selectedDate, time: target.start_time });
              }
            } else if (selectedSlots.length > 0) {
              setShowCheckout(true);
            } else {
              // Return directly to the homepage after login/signup
              setCustomerView('booking');
            }
          }}
          onClose={() => {
            setShowAuthModal(false);
            setAuthPromptMessage(null);
            setPendingSlotToSelect(null);
          }}
        />
      )}

      {/* Checkout Modal */}
      {showCheckout && selectedCourt && (
        <CheckoutModal
          court={selectedCourt}
          dateStr={selectedDate}
          selectedSlots={selectedSlots}
          sessionId={effectiveSessionId}
          currentCustomer={currentCustomer}
          onClose={() => {
            setShowCheckout(false);
            refreshSlots();
          }}
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
