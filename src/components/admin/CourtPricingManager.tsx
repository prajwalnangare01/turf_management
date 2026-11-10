import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { PostgresEngine } from '../../services/postgresEngine';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { AdminUser, Court, BlockedSlot, Sport } from '../../types/schema';
import { ConfirmModal } from '../common/ConfirmModal';
import { Settings, ShieldAlert, Trash2, PlusCircle, Edit3, X, Check, Calendar, Zap, Clock, AlertTriangle, Tag, Sparkles, Percent, RotateCcw } from 'lucide-react';
import { formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';

interface CourtPricingManagerProps {
  currentAdmin: AdminUser;
}

export const CourtPricingManager: React.FC<CourtPricingManagerProps> = ({ currentAdmin }) => {
  const [courts, setCourts] = useState<Court[]>(() => store.getCourts());
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>(() => store.getBlockedSlots());
  const [sports, setSports] = useState<Sport[]>(() => store.getSports());

  // Custom Sport Input State
  const [showAddCustomSportAdd, setShowAddCustomSportAdd] = useState(false);
  const [showAddCustomSportEdit, setShowAddCustomSportEdit] = useState(false);
  const [customSportName, setCustomSportName] = useState('');

  const addPresetSport = (name: string, icon: string, forEditModal: boolean = false) => {
    let existing = sports.find(s => s.name.toLowerCase() === name.toLowerCase());
    let targetSportId = existing?.id;

    if (!existing) {
      const newSport: Sport = {
        id: `sp-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        icon
      };
      const updated = [...sports, newSport];
      store.setSports(updated);
      setSports(updated);
      targetSportId = newSport.id;
    }

    if (targetSportId) {
      if (forEditModal) {
        setEditSportIds(prev => prev.includes(targetSportId!) ? prev : [...prev, targetSportId!]);
      } else {
        setSelectedSportIds(prev => prev.includes(targetSportId!) ? prev : [...prev, targetSportId!]);
      }
    }
  };

  const getEmojiForSport = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('volley')) return '🏐';
    if (lower.includes('basket')) return '🏀';
    if (lower.includes('foot') || lower.includes('soccer') || lower.includes('futsal')) return '⚽';
    if (lower.includes('cricket')) return '🏏';
    if (lower.includes('badminton') || lower.includes('squash')) return '🏸';
    if (lower.includes('tennis') || lower.includes('padel')) return '🎾';
    if (lower.includes('swim') || lower.includes('pool')) return '🏊';
    if (lower.includes('skate') || lower.includes('roller')) return '🛼';
    if (lower.includes('golf')) return '⛳';
    if (lower.includes('boxing') || lower.includes('mma')) return '🥊';
    if (lower.includes('archery')) return '🏹';
    if (lower.includes('bowling')) return '🎳';
    if (lower.includes('table') || lower.includes('ping')) return '🏓';
    return '🏆';
  };

  const handleCreateCustomSport = (forEditModal: boolean = false, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!customSportName.trim()) return;

    const cleanName = customSportName.trim();
    const autoIcon = getEmojiForSport(cleanName);

    // Check if sport already exists
    let existing = sports.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
    let targetSportId = existing?.id;

    if (!existing) {
      const newSport: Sport = {
        id: `sp-${cleanName.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`,
        name: cleanName,
        icon: autoIcon
      };
      const updatedSports = [...sports, newSport];
      store.setSports(updatedSports);
      setSports(updatedSports);
      targetSportId = newSport.id;
    }

    if (targetSportId) {
      if (forEditModal) {
        setEditSportIds(prev => prev.includes(targetSportId!) ? prev : [...prev, targetSportId!]);
      } else {
        setSelectedSportIds(prev => prev.includes(targetSportId!) ? prev : [...prev, targetSportId!]);
      }
    }

    setCustomSportName('');
    if (forEditModal) {
      setShowAddCustomSportEdit(false);
    } else {
      setShowAddCustomSportAdd(false);
    }
  };

  const PREDEFINED_SPORT_IDS = ['sp-football', 'sp-cricket', 'sp-badminton', 'sp-pickleball', 'sp-tennis'];

  const handleDeleteCustomSport = (sportId: string, sportName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      isOpen: true,
      title: `Delete Custom Sport: ${sportName}`,
      message: `Are you sure you want to delete custom sport "${sportName}"? This will remove it from all pitch configurations and sport options.`,
      confirmText: 'Yes, Delete Sport',
      variant: 'danger',
      onConfirm: () => {
        const updated = sports.filter(s => s.id !== sportId);
        store.setSports(updated);
        setSports(updated);
        setSelectedSportIds(prev => prev.filter(id => id !== sportId));
        setEditSportIds(prev => prev.filter(id => id !== sportId));
        closeConfirm();
      }
    });
  };

  // Reusable Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'success' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const closeConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }));

  // Add Court Modal State
  const [showAddCourtModal, setShowAddCourtModal] = useState(false);
  const [newCourtName, setNewCourtName] = useState('');
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([sports[0]?.id || 'sp-football']);
  const [newOriginalPrice, setNewOriginalPrice] = useState<number | ''>('');
  const [newPrice, setNewPrice] = useState(1200);
  const [newSatPrice, setNewSatPrice] = useState(1600);
  const [newSatOfferPrice, setNewSatOfferPrice] = useState<number | ''>('');
  const [newSunPrice, setNewSunPrice] = useState(1600);
  const [newSunOfferPrice, setNewSunOfferPrice] = useState<number | ''>('');
  const [newPeakEnabled, setNewPeakEnabled] = useState(true);
  const [newPeakStart, setNewPeakStart] = useState('18:00');
  const [newPeakEnd, setNewPeakEnd] = useState('23:00');
  const [newPeakPrice, setNewPeakPrice] = useState(1800);
  const [newPeakOfferPrice, setNewPeakOfferPrice] = useState<number | ''>('');
  const [newDuration, setNewDuration] = useState(60);
  const [newOpening, setNewOpening] = useState('06:00');
  const [newClosing, setNewClosing] = useState('23:00');
  const [newBuffer, setNewBuffer] = useState(0);
  const [newStatus, setNewStatus] = useState<'active' | 'maintenance' | 'inactive'>('active');

  // Edit Court Modal State
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editName, setEditName] = useState('');
  const [editSportIds, setEditSportIds] = useState<string[]>([]);
  const [editOriginalPrice, setEditOriginalPrice] = useState<number | ''>('');
  const [editPrice, setEditPrice] = useState(1200);
  const [editSatPrice, setEditSatPrice] = useState(1600);
  const [editSatOfferPrice, setEditSatOfferPrice] = useState<number | ''>('');
  const [editSunPrice, setEditSunPrice] = useState(1600);
  const [editSunOfferPrice, setEditSunOfferPrice] = useState<number | ''>('');
  const [editPeakEnabled, setEditPeakEnabled] = useState(true);
  const [editPeakStart, setEditPeakStart] = useState('18:00');
  const [editPeakEnd, setEditPeakEnd] = useState('23:00');
  const [editPeakPrice, setEditPeakPrice] = useState(1800);
  const [editPeakOfferPrice, setEditPeakOfferPrice] = useState<number | ''>('');
  const [editDuration, setEditDuration] = useState(60);
  const [editOpening, setEditOpening] = useState('06:00');
  const [editClosing, setEditClosing] = useState('23:00');
  const [editBuffer, setEditBuffer] = useState(0);
  const [editStatus, setEditStatus] = useState<'active' | 'maintenance' | 'inactive'>('active');

  // Block slot form state (Start Date & Time + End Date & Time)
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockCourtId, setBlockCourtId] = useState(courts[0]?.id || '');
  const [blockStartDate, setBlockStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockStartTime, setBlockStartTime] = useState('06:00');
  const [blockEndDate, setBlockEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockEndTime, setBlockEndTime] = useState('23:00');
  const [blockReason, setBlockReason] = useState<'maintenance' | 'private_event' | 'owner_block'>('maintenance');

  // Occasion Offer Modal State
  const [showOccasionOfferModal, setShowOccasionOfferModal] = useState(false);
  const [offerPercentage, setOfferPercentage] = useState<number>(10);
  const [offerOccasionName, setOfferOccasionName] = useState<string>('');
  const [selectedCourtIdsForOffer, setSelectedCourtIdsForOffer] = useState<string[]>([]);
  const [offerRateTypes, setOfferRateTypes] = useState({
    weekday: true,
    saturday: true,
    sunday: true,
    peak: true
  });
  const [isApplyingOffer, setIsApplyingOffer] = useState(false);

  // Helper: check if a court currently has any promotional offer active
  const isCourtOfferActive = (c: Court) => {
    const hasWeekdayOffer = Boolean(c.original_price_per_hour && c.original_price_per_hour > c.base_price_per_hour);
    const satBase = c.saturday_price_per_hour ?? c.base_price_per_hour;
    const hasSatOffer = Boolean(c.saturday_offer_price_per_hour && c.saturday_offer_price_per_hour > 0 && c.saturday_offer_price_per_hour !== satBase);
    const sunBase = c.sunday_price_per_hour ?? c.base_price_per_hour;
    const hasSunOffer = Boolean(c.sunday_offer_price_per_hour && c.sunday_offer_price_per_hour > 0 && c.sunday_offer_price_per_hour !== sunBase);
    const peakBase = c.peak_price_per_hour ?? 1800;
    const hasPeakOffer = Boolean(c.peak_enabled && c.peak_offer_price_per_hour && c.peak_offer_price_per_hour > 0 && c.peak_offer_price_per_hour !== peakBase);
    return hasWeekdayOffer || hasSatOffer || hasSunOffer || hasPeakOffer;
  };

  const activeOfferCourts = courts.filter(isCourtOfferActive);

  const handleOpenOccasionOfferModal = () => {
    setSelectedCourtIdsForOffer(courts.map(c => c.id));
    setShowOccasionOfferModal(true);
  };

  // Helper: calculate discounted prices for a court based on percentage and selected rate categories
  const calculateOfferPricingForCourt = (court: Court, pct: number, types: typeof offerRateTypes) => {
    const discountRatio = Math.max(0, (100 - pct) / 100);

    // Weekday calculation (preserves true baseline MRP if already on discount)
    const origWeekday = (court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour)
      ? court.original_price_per_hour
      : court.base_price_per_hour;
    const newBasePrice = types.weekday ? Math.round(origWeekday * discountRatio) : court.base_price_per_hour;
    const newOriginalPrice = types.weekday ? origWeekday : court.original_price_per_hour;

    // Saturday calculation
    const baseSat = court.saturday_price_per_hour ?? court.base_price_per_hour;
    const newSatOfferPrice = types.saturday ? Math.round(baseSat * discountRatio) : court.saturday_offer_price_per_hour;

    // Sunday calculation
    const baseSun = court.sunday_price_per_hour ?? court.base_price_per_hour;
    const newSunOfferPrice = types.sunday ? Math.round(baseSun * discountRatio) : court.sunday_offer_price_per_hour;

    // Peak hours calculation
    const basePeak = court.peak_price_per_hour ?? 1800;
    const newPeakOfferPrice = (types.peak && court.peak_enabled)
      ? Math.round(basePeak * discountRatio)
      : court.peak_offer_price_per_hour;

    return {
      origWeekday,
      newBasePrice,
      newOriginalPrice,
      baseSat,
      newSatOfferPrice,
      baseSun,
      newSunOfferPrice,
      basePeak,
      newPeakOfferPrice
    };
  };

  const handleApplyOccasionOffer = async () => {
    if (selectedCourtIdsForOffer.length === 0) {
      alert('Please select at least one pitch/court to apply the offer to.');
      return;
    }
    if (offerPercentage <= 0 || offerPercentage >= 100) {
      alert('Discount percentage must be between 1% and 99%.');
      return;
    }
    if (!offerRateTypes.weekday && !offerRateTypes.saturday && !offerRateTypes.sunday && !offerRateTypes.peak) {
      alert('Please select at least one rate category (Weekday, Saturday, Sunday, or Peak).');
      return;
    }

    setIsApplyingOffer(true);
    try {
      const updatedCourts = courts.map(court => {
        if (!selectedCourtIdsForOffer.includes(court.id)) {
          return court;
        }

        const calc = calculateOfferPricingForCourt(court, offerPercentage, offerRateTypes);
        const updated: Court = {
          ...court,
          base_price_per_hour: calc.newBasePrice,
          original_price_per_hour: calc.newOriginalPrice,
          saturday_offer_price_per_hour: calc.newSatOfferPrice,
          sunday_offer_price_per_hour: calc.newSunOfferPrice,
          peak_offer_price_per_hour: calc.newPeakOfferPrice
        };

        SupabaseSyncService.syncCourtToSupabase(updated).catch(err => {
          console.warn(`❌ [OccasionOffer] Error syncing court ${court.id} to Supabase:`, err);
        });

        AuditLogger.log(
          currentAdmin.id,
          'UPDATE_COURT',
          'Court',
          court.id,
          court,
          {
            ...updated,
            _offerApplied: `${offerPercentage}% OFF ${offerOccasionName ? `(${offerOccasionName})` : ''}`
          }
        );

        return updated;
      });

      store.setCourts(updatedCourts);
      setCourts(updatedCourts);
      setShowOccasionOfferModal(false);
      setIsApplyingOffer(false);
    } catch (err) {
      console.error('Failed to apply occasion offer:', err);
      setIsApplyingOffer(false);
      alert('Failed to apply offer across pitches. Please try again.');
    }
  };

  const executeResetCourtOffer = (courtId: string) => {
    const target = courts.find(c => c.id === courtId);
    if (!target) return;

    const restoredWeekday = (target.original_price_per_hour && target.original_price_per_hour > target.base_price_per_hour)
      ? target.original_price_per_hour
      : target.base_price_per_hour;

    const updatedCourt: Court = {
      ...target,
      base_price_per_hour: restoredWeekday,
      original_price_per_hour: undefined,
      saturday_offer_price_per_hour: undefined,
      sunday_offer_price_per_hour: undefined,
      peak_offer_price_per_hour: undefined
    };

    const updatedCourts = courts.map(c => c.id === courtId ? updatedCourt : c);
    store.setCourts(updatedCourts);
    setCourts(updatedCourts);

    SupabaseSyncService.syncCourtToSupabase(updatedCourt).catch(err => {
      console.warn(`❌ [OccasionOffer] Error restoring court ${courtId} to Supabase:`, err);
    });

    AuditLogger.log(currentAdmin.id, 'UPDATE_COURT', 'Court', courtId, target, updatedCourt);
    closeConfirm();
  };

  const handlePromptResetCourtOffer = (court: Court) => {
    setConfirmState({
      isOpen: true,
      title: `End Offer on ${court.name}`,
      message: `Reset "${court.name}" back to standard non-discounted pricing? Original weekday price will be restored to ₹${court.original_price_per_hour || court.base_price_per_hour}/hr and all weekend/peak offer prices will be cleared.`,
      confirmText: 'Reset Pitch Pricing',
      variant: 'warning',
      onConfirm: () => executeResetCourtOffer(court.id)
    });
  };

  const executeResetAllOffers = () => {
    const updatedCourts = courts.map(court => {
      if (!isCourtOfferActive(court)) return court;

      const restoredWeekday = (court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour)
        ? court.original_price_per_hour
        : court.base_price_per_hour;

      const updatedCourt: Court = {
        ...court,
        base_price_per_hour: restoredWeekday,
        original_price_per_hour: undefined,
        saturday_offer_price_per_hour: undefined,
        sunday_offer_price_per_hour: undefined,
        peak_offer_price_per_hour: undefined
      };

      SupabaseSyncService.syncCourtToSupabase(updatedCourt).catch(err => {
        console.warn(`❌ [OccasionOffer] Error resetting court ${court.id} to Supabase:`, err);
      });

      AuditLogger.log(currentAdmin.id, 'UPDATE_COURT', 'Court', court.id, court, updatedCourt);
      return updatedCourt;
    });

    store.setCourts(updatedCourts);
    setCourts(updatedCourts);
    closeConfirm();
  };

  const handlePromptResetAllOffers = () => {
    setConfirmState({
      isOpen: true,
      title: 'End All Active Offers Across All Pitches',
      message: `Are you sure you want to end all promotional offers? All pitches (${activeOfferCourts.length}) will immediately revert back to their standard non-discounted rates across the Website and WhatsApp.`,
      confirmText: 'Yes, End All Offers',
      variant: 'warning',
      onConfirm: executeResetAllOffers
    });
  };

  const canEdit = true; // Add, Edit, and Delete features enabled for Admin Panel

  const executeAddCourt = () => {
    const origPriceNum = newOriginalPrice !== '' ? Number(newOriginalPrice) : undefined;
    const satOfferNum = newSatOfferPrice !== '' ? Number(newSatOfferPrice) : undefined;
    const sunOfferNum = newSunOfferPrice !== '' ? Number(newSunOfferPrice) : undefined;
    const peakOfferNum = newPeakOfferPrice !== '' ? Number(newPeakOfferPrice) : undefined;
    const newCourt: Court = {
      id: `crt-${Date.now()}`,
      venue_id: store.getVenue().id,
      name: newCourtName.trim(),
      sport_ids: selectedSportIds,
      base_price_per_hour: Number(newPrice) || 1000,
      original_price_per_hour: origPriceNum && origPriceNum > 0 ? origPriceNum : undefined,
      saturday_price_per_hour: Number(newSatPrice) || Number(newPrice) || 1200,
      saturday_offer_price_per_hour: satOfferNum && satOfferNum > 0 ? satOfferNum : undefined,
      sunday_price_per_hour: Number(newSunPrice) || Number(newPrice) || 1200,
      sunday_offer_price_per_hour: sunOfferNum && sunOfferNum > 0 ? sunOfferNum : undefined,
      peak_enabled: newPeakEnabled,
      peak_start_time: newPeakStart,
      peak_end_time: newPeakEnd,
      peak_price_per_hour: Number(newPeakPrice) || 1800,
      peak_offer_price_per_hour: peakOfferNum && peakOfferNum > 0 ? peakOfferNum : undefined,
      slot_duration_minutes: Number(newDuration) || 60,
      opening_time: newOpening || '06:00',
      closing_time: newClosing || '23:00',
      buffer_minutes: Number(newBuffer) || 0,
      status: newStatus
    };

    const updatedCourts = [...courts, newCourt];
    store.setCourts(updatedCourts);
    setCourts(updatedCourts);
    SupabaseSyncService.syncCourtToSupabase(newCourt).catch(err => {
      console.warn('❌ [CourtPricingManager] Error syncing new court to Supabase:', err);
    });

    AuditLogger.log(currentAdmin.id, 'CREATE_COURT', 'Court', newCourt.id, null, newCourt);

    setNewCourtName('');
    setNewOriginalPrice('');
    setNewPrice(1200);
    setNewSatPrice(1600);
    setNewSatOfferPrice('');
    setNewSunPrice(1600);
    setNewSunOfferPrice('');
    setNewPeakPrice(1800);
    setNewPeakOfferPrice('');
    setShowAddCourtModal(false);
    closeConfirm();
  };

  const handleAddCourt = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can add pitches.');
      return;
    }

    if (!newCourtName.trim()) {
      alert('Please enter a valid court / pitch name');
      return;
    }

    if (selectedSportIds.length === 0) {
      alert('Please select at least one sport for this court');
      return;
    }

    if (newOpening >= newClosing) {
      alert('Opening time must be earlier than closing time.');
      return;
    }

    if (Number(newPrice) < 0 || Number(newSatPrice) < 0 || Number(newSunPrice) < 0) {
      alert('Prices cannot be negative.');
      return;
    }

    if (newPeakEnabled && newPeakStart >= newPeakEnd) {
      alert('Peak start time must be earlier than peak end time.');
      return;
    }

    if (Number(newDuration) <= 0 || Number(newBuffer) < 0) {
      alert('Slot duration must be positive and buffer minutes cannot be negative.');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Confirm New Pitch Creation',
      message: `Add "${newCourtName.trim()}" (Weekday: ₹${newPrice}/hr | Sat: ₹${newSatPrice}/hr | Sun: ₹${newSunPrice}/hr${newPeakEnabled ? ` | Peak: ₹${newPeakPrice}/hr [${newPeakStart}-${newPeakEnd}]` : ''})?`,
      confirmText: 'Save & Launch Pitch',
      variant: 'success',
      onConfirm: executeAddCourt
    });
  };

  const handleStartEditCourt = (court: Court) => {
    setEditingCourt(court);
    setEditName(court.name);
    setEditSportIds(court.sport_ids);
    setEditOriginalPrice(court.original_price_per_hour ?? '');
    setEditPrice(court.base_price_per_hour);
    setEditSatPrice(court.saturday_price_per_hour ?? court.base_price_per_hour);
    setEditSatOfferPrice(court.saturday_offer_price_per_hour ?? '');
    setEditSunPrice(court.sunday_price_per_hour ?? court.base_price_per_hour);
    setEditSunOfferPrice(court.sunday_offer_price_per_hour ?? '');
    setEditPeakEnabled(court.peak_enabled ?? true);
    setEditPeakStart(court.peak_start_time || '18:00');
    setEditPeakEnd(court.peak_end_time || '23:00');
    setEditPeakPrice(court.peak_price_per_hour || 1800);
    setEditPeakOfferPrice(court.peak_offer_price_per_hour ?? '');
    setEditDuration(court.slot_duration_minutes);
    setEditOpening(court.opening_time);
    setEditClosing(court.closing_time);
    setEditBuffer(court.buffer_minutes);
    setEditStatus(court.status);
  };

  const executeUpdateCourt = () => {
    if (!editingCourt) return;
    const origPriceNum = editOriginalPrice !== '' ? Number(editOriginalPrice) : undefined;
    const satOfferNum = editSatOfferPrice !== '' ? Number(editSatOfferPrice) : undefined;
    const sunOfferNum = editSunOfferPrice !== '' ? Number(editSunOfferPrice) : undefined;
    const peakOfferNum = editPeakOfferPrice !== '' ? Number(editPeakOfferPrice) : undefined;
    const updatedCourt: Court = {
      ...editingCourt,
      name: editName.trim(),
      sport_ids: editSportIds,
      base_price_per_hour: Number(editPrice),
      original_price_per_hour: origPriceNum && origPriceNum > 0 ? origPriceNum : undefined,
      saturday_price_per_hour: Number(editSatPrice),
      saturday_offer_price_per_hour: satOfferNum && satOfferNum > 0 ? satOfferNum : undefined,
      sunday_price_per_hour: Number(editSunPrice),
      sunday_offer_price_per_hour: sunOfferNum && sunOfferNum > 0 ? sunOfferNum : undefined,
      peak_enabled: editPeakEnabled,
      peak_start_time: editPeakStart,
      peak_end_time: editPeakEnd,
      peak_price_per_hour: Number(editPeakPrice),
      peak_offer_price_per_hour: peakOfferNum && peakOfferNum > 0 ? peakOfferNum : undefined,
      slot_duration_minutes: Number(editDuration),
      opening_time: editOpening,
      closing_time: editClosing,
      buffer_minutes: Number(editBuffer),
      status: editStatus
    };

    const updatedCourts = courts.map(c => (c.id === editingCourt.id ? updatedCourt : c));
    store.setCourts(updatedCourts);
    setCourts(updatedCourts);
    SupabaseSyncService.syncCourtToSupabase(updatedCourt).catch(err => {
      console.warn('❌ [CourtPricingManager] Error syncing updated court to Supabase:', err);
    });

    AuditLogger.log(currentAdmin.id, 'UPDATE_COURT', 'Court', editingCourt.id, editingCourt, updatedCourt);
    setEditingCourt(null);
    closeConfirm();
  };

  const handleUpdateCourt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourt) return;

    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can modify pitches.');
      return;
    }

    if (!editName.trim()) {
      alert('Please enter a valid pitch name');
      return;
    }

    if (editOpening >= editClosing) {
      alert('Opening time must be earlier than closing time.');
      return;
    }

    if (Number(editPrice) < 0 || Number(editSatPrice) < 0 || Number(editSunPrice) < 0) {
      alert('Prices cannot be negative.');
      return;
    }

    if (editPeakEnabled && editPeakStart >= editPeakEnd) {
      alert('Peak start time must be earlier than peak end time.');
      return;
    }

    if (Number(editDuration) <= 0 || Number(editBuffer) < 0) {
      alert('Slot duration must be positive and buffer minutes cannot be negative.');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Confirm Pitch Modification',
      message: `Save pricing & timing updates to "${editName.trim()}" (Weekday: ₹${editPrice}/hr, Sat: ₹${editSatPrice}/hr, Sun: ₹${editSunPrice}/hr${editPeakEnabled ? `, Peak: ₹${editPeakPrice}/hr [${editPeakStart}-${editPeakEnd}]` : ''})?`,
      confirmText: 'Update Pitch Specs',
      variant: 'info',
      onConfirm: executeUpdateCourt
    });
  };

  const handleDeleteCourt = (courtId: string, courtName: string) => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can delete pitches.');
      return;
    }

    const activeBookings = store.getBookings().filter(
      b => b.court_id === courtId && (b.status === 'confirmed' || b.status === 'pending_payment')
    );

    let warningMsg = `Are you sure you want to delete pitch "${courtName}"? This action cannot be undone.`;
    if (activeBookings.length > 0) {
      warningMsg = `CRITICAL WARNING: Pitch "${courtName}" currently has ${activeBookings.length} active booking(s)! Deleting this pitch will remove it from future customer selections. Proceed anyway?`;
    }

    setConfirmState({
      isOpen: true,
      title: `Delete Pitch: ${courtName}`,
      message: warningMsg,
      confirmText: 'Yes, Delete Pitch',
      variant: 'danger',
      onConfirm: () => {
        const updatedCourts = courts.filter(c => c.id !== courtId);
        store.setCourts(updatedCourts);
        setCourts(updatedCourts);
        AuditLogger.log(currentAdmin.id, 'DELETE_COURT', 'Court', courtId);
        closeConfirm();
      }
    });
  };

  const toggleSportSelection = (sportId: string, isEdit: boolean = false) => {
    if (isEdit) {
      if (editSportIds.includes(sportId)) {
        if (editSportIds.length === 1) return;
        setEditSportIds(editSportIds.filter(id => id !== sportId));
      } else {
        setEditSportIds([...editSportIds, sportId]);
      }
    } else {
      if (selectedSportIds.includes(sportId)) {
        if (selectedSportIds.length === 1) return;
        setSelectedSportIds(selectedSportIds.filter(id => id !== sportId));
      } else {
        setSelectedSportIds([...selectedSportIds, sportId]);
      }
    }
  };

  const executeCreateBlock = () => {
    const newBlock: BlockedSlot = {
      id: `blk-${Date.now()}`,
      court_id: blockCourtId,
      date: blockStartDate,
      start_time: blockStartTime,
      end_date: blockEndDate,
      end_time: blockEndTime,
      reason: blockReason,
      created_by_admin_id: currentAdmin.id
    };

    const updated = [...blockedSlots, newBlock];
    store.setBlockedSlots(updated);
    setBlockedSlots(updated);
    SupabaseSyncService.syncBlockedSlotToSupabase(newBlock);
    AuditLogger.log(currentAdmin.id, 'CREATE_BLOCKED_SLOT', 'BlockedSlot', newBlock.id, null, newBlock);
    setShowBlockModal(false);
    closeConfirm();
  };

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const court = courts.find(c => c.id === blockCourtId);

    // Validate datetime sequence
    if (blockEndDate < blockStartDate || (blockEndDate === blockStartDate && blockEndTime <= blockStartTime)) {
      alert('⚠️ Invalid Schedule: End Date & Time must be strictly after Start Date & Time.');
      return;
    }

    // CC-D03: Guard checking if any active confirmed or pending customer booking exists in this interval
    const conflict = store.getBookings().find(b =>
      b.court_id === blockCourtId &&
      (b.status === 'confirmed' || b.status === 'pending_payment') &&
      PostgresEngine.isDateTimeOverlap(
        b.booking_date,
        b.start_time,
        b.end_time,
        blockStartDate,
        blockStartTime,
        blockEndDate,
        blockEndTime
      )
    );

    if (conflict) {
      alert(`⚠️ [Pitch Block Conflict Guard (CC-D03)]\n\nCannot block court: An active booking exists during this timeframe:\n• Booking Ref: ${conflict.booking_ref}\n• Customer: ${conflict.customer_name}\n• Scheduled: ${formatDateDDMMYYYY(conflict.booking_date)} (${formatTime12hPlain(conflict.start_time)} – ${formatTime12hPlain(conflict.end_time)})\n\nPlease reschedule or cancel the booking first before scheduling pitch maintenance.`);
      return;
    }

    const scheduleDesc = blockStartDate === blockEndDate
      ? `${formatDateDDMMYYYY(blockStartDate)} from ${formatTime12hPlain(blockStartTime)} to ${formatTime12hPlain(blockEndTime)}`
      : `${formatDateDDMMYYYY(blockStartDate)} (${formatTime12hPlain(blockStartTime)}) to ${formatDateDDMMYYYY(blockEndDate)} (${formatTime12hPlain(blockEndTime)})`;

    setConfirmState({
      isOpen: true,
      title: 'Confirm Pitch Maintenance Block',
      message: `Block ${court?.name || 'Pitch'} for ${scheduleDesc} for reason: ${blockReason.toUpperCase().replace('_', ' ')}? All slots in this interval will be closed across Website and WhatsApp.`,
      confirmText: 'Confirm Block',
      variant: 'warning',
      onConfirm: executeCreateBlock
    });
  };

  const handleDeleteBlock = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Maintenance Block',
      message: 'Are you sure you want to unblock this maintenance interval and restore court availability?',
      confirmText: 'Unblock Pitch',
      variant: 'success',
      onConfirm: () => {
        const updated = blockedSlots.filter(b => b.id !== id);
        store.setBlockedSlots(updated);
        setBlockedSlots(updated);
        SupabaseSyncService.removeBlockedSlotFromSupabase(id);
        AuditLogger.log(currentAdmin.id, 'DELETE_BLOCKED_SLOT', 'BlockedSlot', id);
        closeConfirm();
      }
    });
  };

  return (
    <div className="space-y-6 text-on-surface">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/40">
        <div>
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> Turf Arenas & Pitch Inventory
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">Add, edit, remove pitches, set Saturday/Sunday rates, and configure peak hour pricing window.</p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenOccasionOfferModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 font-headline font-bold shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" /> + Add Occasion Offer
            </button>

            <button
              onClick={() => setShowAddCourtModal(true)}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 font-headline font-bold shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> + Add New Pitch / Court
            </button>

            <button
              onClick={() => setShowBlockModal(true)}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 font-headline font-bold text-amber-800 border-amber-300"
            >
              <ShieldAlert className="w-4 h-4 text-amber-700" /> + Block Maintenance
            </button>
          </div>
        )}
      </div>

      {/* Active Occasion Offer Banner */}
      {activeOfferCourts.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-headline font-bold text-sm text-emerald-950">
                  🎉 Active Occasion / Promotional Offer Running
                </h4>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {activeOfferCourts.length} of {courts.length} Pitches Discounted
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Discounted rates and original MRP strikethroughs are active across Website & WhatsApp bookings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={handleOpenOccasionOfferModal}
              className="btn-primary text-xs px-3.5 py-2 font-headline font-bold flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" /> Adjust Offer
            </button>
            <button
              onClick={handlePromptResetAllOffers}
              className="btn-secondary text-xs px-3.5 py-2 font-headline font-bold text-red-700 border-red-300 hover:bg-red-50 flex items-center gap-1.5 rounded-xl shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" /> End / Reset All Offers
            </button>
          </div>
        </div>
      )}

      {/* Courts Inventory Cards List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-headline font-bold text-sm text-on-surface uppercase tracking-wider">
            Configured Pitches ({courts.length})
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {courts.map(court => {
            const courtSports = sports.filter(s => court.sport_ids.includes(s.id));
            const satPrice = court.saturday_price_per_hour ?? court.base_price_per_hour;
            const sunPrice = court.sunday_price_per_hour ?? court.base_price_per_hour;
            const hasCourtOffer = isCourtOfferActive(court);

            return (
              <div key={court.id} className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-3 relative group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-headline font-bold text-base text-on-surface leading-snug">{court.name}</h3>
                      {hasCourtOffer && (
                        <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs tracking-wider uppercase">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-200" /> Offer Active
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {courtSports.map(s => (
                        <span key={s.id} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {s.icon} {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour && (
                      <span className="text-[11px] line-through text-on-surface-variant/70 font-semibold">
                        ₹{court.original_price_per_hour}
                      </span>
                    )}
                    <span className="text-xs font-headline font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      Mon-Fri: ₹{court.base_price_per_hour}/hr
                      {court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour && (
                        <span className="ml-1 text-[10px] text-emerald-800 bg-emerald-100 font-extrabold px-1.5 py-0.5 rounded-full">
                          {Math.round(((court.original_price_per_hour - court.base_price_per_hour) / court.original_price_per_hour) * 100)}% OFF
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Pricing Rules Overview Badges */}
                <div className="bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-lg space-y-2 text-xs font-headline">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-700" /> Weekend Rates:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded text-[11px]">
                        Sat: {court.saturday_offer_price_per_hour && court.saturday_offer_price_per_hour !== satPrice ? (
                          <>
                            <span className="line-through text-amber-700/70 mr-1 font-semibold">₹{Math.max(satPrice, court.saturday_offer_price_per_hour)}</span>
                            ₹{Math.min(satPrice, court.saturday_offer_price_per_hour)}/hr
                          </>
                        ) : (
                          `₹${satPrice}/hr`
                        )}
                      </span>
                      <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded text-[11px]">
                        Sun: {court.sunday_offer_price_per_hour && court.sunday_offer_price_per_hour !== sunPrice ? (
                          <>
                            <span className="line-through text-amber-700/70 mr-1 font-semibold">₹{Math.max(sunPrice, court.sunday_offer_price_per_hour)}</span>
                            ₹{Math.min(sunPrice, court.sunday_offer_price_per_hour)}/hr
                          </>
                        ) : (
                          `₹${sunPrice}/hr`
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Peak Pricing Indicator */}
                  <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                    <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" /> Peak Window:
                    </span>
                    {court.peak_enabled ? (
                      <span className="bg-amber-600 text-white font-extrabold px-2 py-0.5 rounded text-[10px] tracking-wide uppercase">
                        {formatTime12hPlain(court.peak_start_time || '18:00')} – {formatTime12hPlain(court.peak_end_time || '23:00')} ({
                          court.peak_offer_price_per_hour && court.peak_offer_price_per_hour !== court.peak_price_per_hour ? (
                            <>
                              <span className="line-through opacity-75 mr-1 font-semibold">₹{Math.max(court.peak_price_per_hour || 0, court.peak_offer_price_per_hour || 0)}</span>
                              ₹{Math.min(court.peak_price_per_hour || 0, court.peak_offer_price_per_hour || 0)}/hr
                            </>
                          ) : (
                            `₹${court.peak_price_per_hour}/hr`
                          )
                        })
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/70 italic text-[11px]">Standard Rates</span>
                    )}
                  </div>
                </div>

                <div className="text-xs space-y-1.5 text-on-surface-variant bg-surface-container-low p-3.5 rounded-lg border border-outline-variant/30 font-medium">
                  <div className="flex justify-between">
                    <span>Slot Duration:</span>
                    <strong className="text-on-surface font-semibold">{court.slot_duration_minutes} mins</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Turnover Buffer:</span>
                    <strong className="text-primary font-bold">{court.buffer_minutes} mins</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Operating Hours:</span>
                    <strong className="text-on-surface font-semibold">{formatTime12hPlain(court.opening_time)} – {formatTime12hPlain(court.closing_time)}</strong>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-outline-variant/30">
                    <span>Status:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      court.status === 'active' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900'
                    }`}>
                      {court.status}
                    </span>
                  </div>
                </div>

                {canEdit && (
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-outline-variant/30">
                    {hasCourtOffer && (
                      <button
                        onClick={() => handlePromptResetCourtOffer(court)}
                        className="text-xs text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 p-1 rounded hover:bg-amber-50 transition-colors mr-auto"
                        title="Reset promotional rates back to standard rates for this pitch"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> End Offer
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEditCourt(court)}
                      className="text-xs text-primary hover:text-primary-container font-bold flex items-center gap-1 p-1 rounded hover:bg-primary/10 transition-colors"
                      title="Edit Pitch Parameters, Peak Hours & Weekend Pricing"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Pitch & Peak Rates
                    </button>
                    <button
                      onClick={() => handleDeleteCourt(court.id, court.name)}
                      className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Remove Pitch"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Pitch
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Blocked Slots */}
      <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-3">
        <h3 className="font-headline font-bold text-base text-on-surface flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700" /> Active Blocked Slots / Maintenance Days
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {blockedSlots.length === 0 ? (
            <p className="text-on-surface-variant py-4 col-span-2 text-xs">No active blocked slots.</p>
          ) : (
            blockedSlots.map(blk => {
              const court = courts.find(c => c.id === blk.court_id);
              const isSingleDay = !blk.end_date || blk.end_date === blk.date;
              return (
                <div key={blk.id} className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40 flex justify-between items-start gap-3 shadow-xs">
                  <div className="space-y-1">
                    <p className="font-headline font-bold text-on-surface text-sm flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                      {court?.name || 'Pitch'}
                    </p>
                    <div className="text-on-surface-variant text-xs font-medium space-y-0.5">
                      {isSingleDay ? (
                        <p className="flex items-center gap-1.5 text-gray-700">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold">{formatDateDDMMYYYY(blk.date)}</span>
                          <span className="text-gray-400">•</span>
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          <span>{formatTime12hPlain(blk.start_time)} – {blk.end_time ? formatTime12hPlain(blk.end_time) : 'End of Day'}</span>
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 text-gray-700">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span>{formatDateDDMMYYYY(blk.date)} <strong className="text-gray-900">({formatTime12hPlain(blk.start_time)})</strong></span>
                          <span className="text-amber-700 font-bold mx-1">➔</span>
                          <span>{formatDateDDMMYYYY(blk.end_date || blk.date)} <strong className="text-gray-900">({blk.end_time ? formatTime12hPlain(blk.end_time) : 'End of Day'})</strong></span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block">
                        {blk.reason === 'maintenance' ? '🛠️ Maintenance' : blk.reason === 'private_event' ? '🏆 Private Event' : '🔒 Owner Block'}
                      </span>
                      {!isSingleDay && (
                        <span className="bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          Multi-Day
                        </span>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleDeleteBlock(blk.id)}
                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Unblock pitch & restore slot availability"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Court Modal */}
      {showAddCourtModal && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
              <h3 className="font-headline font-bold text-xl text-primary flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-primary" /> Add New Pitch / Turf Arena
              </h3>
              <button onClick={() => setShowAddCourtModal(false)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCourt} className="space-y-4 text-xs">
              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Pitch / Turf Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Turf C — 7-a-side FIFA Synthetic"
                  value={newCourtName}
                  onChange={e => setNewCourtName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1.5">Supported Sports *</label>
                <div className="flex flex-wrap gap-2">
                  {sports.map(s => {
                    const isSelected = selectedSportIds.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleSportSelection(s.id, false)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary'
                        }`}
                      >
                        <span>{s.icon}</span>
                        <span>{s.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        {!PREDEFINED_SPORT_IDS.includes(s.id) && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleDeleteCustomSport(s.id, s.name, e)}
                            className="ml-1 p-0.5 hover:bg-red-500/30 hover:text-red-200 rounded-full transition-colors cursor-pointer"
                            title={`Delete ${s.name} custom sport`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowAddCustomSportAdd(prev => !prev)}
                    className="px-3 py-1.5 rounded-lg border border-dashed border-primary text-primary bg-primary/5 hover:bg-primary/10 text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <span>➕</span>
                    <span>Other / Custom Sport</span>
                  </button>
                </div>

                {showAddCustomSportAdd && (
                  <div className="bg-primary/5 border border-primary/20 p-3.5 rounded-xl space-y-3 mt-2.5 animate-modalScaleIn">
                    <div>
                      <span className="text-[11px] font-bold text-primary uppercase tracking-wider block mb-1.5">
                        ⚡ Quick 1-Click Sports
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: 'Volleyball', icon: '🏐' },
                          { name: 'Basketball', icon: '🏀' },
                          { name: 'Futsal', icon: '⚽' },
                          { name: 'Padel', icon: '🎾' },
                          { name: 'Squash', icon: '🏸' },
                          { name: 'Kabaddi', icon: '🤼' }
                        ].map(preset => (
                          <button
                            type="button"
                            key={preset.name}
                            onClick={() => addPresetSport(preset.name, preset.icon, false)}
                            className="bg-white hover:bg-primary/10 border border-outline-variant/50 text-on-surface text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <span>{preset.icon}</span>
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/30 pt-2.5">
                      <span className="text-[11px] font-bold text-on-surface block mb-1">
                        Or Type Custom Sport Name:
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type Sport Name (e.g. Volleyball, Swimming, Archery)"
                          value={customSportName}
                          onChange={e => setCustomSportName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCreateCustomSport(false, e as any);
                            }
                          }}
                          className="form-input text-xs flex-1 py-1.5 font-medium"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCreateCustomSport(false, e);
                          }}
                          className="btn-primary text-xs px-3.5 py-1.5 font-bold shrink-0 shadow-sm"
                        >
                          + Add Sport
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Day-based Pricing Configuration Box */}
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-headline font-bold text-xs text-primary flex items-center gap-1.5 uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-primary" /> Weekday & Weekend Base Rates
                  </h4>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Discount UI Enabled
                  </span>
                </div>

                {/* Original vs Discounted Rate inputs */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5">
                    🏷️ Pitch Base Pricing & UI Discount Strike-through
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-on-surface-variant font-headline font-bold text-[11px] mb-1">
                        Original Price / MRP (₹/hr)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 1500"
                        min={0}
                        value={newOriginalPrice}
                        onChange={e => setNewOriginalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="form-input font-bold text-on-surface-variant bg-white"
                      />
                      <span className="text-[10px] text-on-surface-variant/70 block mt-0.5">
                        Will show as strikethrough (cut out) on the website
                      </span>
                    </div>

                    <div>
                      <label className="block text-emerald-900 font-headline font-bold text-[11px] mb-1">
                        Discounted / Active Price (₹/hr) *
                      </label>
                      <input
                        type="number"
                        required
                        min={100}
                        value={newPrice}
                        onChange={e => setNewPrice(Number(e.target.value))}
                        className="form-input font-bold text-emerald-900 bg-white border-emerald-400"
                      />
                      <span className="text-[10px] text-emerald-700 block mt-0.5">
                        Actual booking price charged to customers
                      </span>
                    </div>
                  </div>

                  {Number(newOriginalPrice) > Number(newPrice) && (
                    <div className="flex items-center gap-2 pt-1 text-xs font-bold text-emerald-800 border-t border-emerald-200/60">
                      <span>UI Preview:</span>
                      <span className="line-through text-on-surface-variant">₹{newOriginalPrice}</span>
                      <span className="text-emerald-900 font-extrabold text-sm">₹{newPrice}/hr</span>
                      <span className="bg-emerald-200/70 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                        {Math.round(((Number(newOriginalPrice) - Number(newPrice)) / Number(newOriginalPrice)) * 100)}% OFF (Save ₹{Number(newOriginalPrice) - Number(newPrice)})
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Saturday */}
                  <div className="bg-white p-3 rounded-xl border border-amber-300/70 shadow-xs space-y-1.5">
                    <label className="block text-amber-950 font-headline font-bold text-xs flex items-center justify-between">
                      <span>Saturday (Sat) Rate *</span>
                      <span className="text-[10px] text-amber-800 font-normal">Weekend</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-on-surface-variant font-semibold mb-0.5">Regular (₹/hr)</span>
                        <input
                          type="number"
                          required
                          min={100}
                          value={newSatPrice}
                          onChange={e => setNewSatPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300 py-1"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-emerald-800 font-semibold mb-0.5">Offer Price (Optional)</span>
                        <input
                          type="number"
                          placeholder="e.g. 1400"
                          min={0}
                          value={newSatOfferPrice}
                          onChange={e => setNewSatOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 bg-white border-emerald-300 py-1"
                        />
                      </div>
                    </div>
                    {newSatOfferPrice !== '' && Number(newSatOfferPrice) > 0 && Number(newSatOfferPrice) !== Number(newSatPrice) && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 pt-0.5 border-t border-emerald-100">
                        <span className="line-through text-on-surface-variant/70">₹{Math.max(Number(newSatPrice), Number(newSatOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold">₹{Math.min(Number(newSatPrice), Number(newSatOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded-full font-black">
                          {Math.round(((Math.abs(Number(newSatPrice) - Number(newSatOfferPrice))) / Math.max(Number(newSatPrice), Number(newSatOfferPrice))) * 100)}% OFF
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sunday */}
                  <div className="bg-white p-3 rounded-xl border border-amber-300/70 shadow-xs space-y-1.5">
                    <label className="block text-amber-950 font-headline font-bold text-xs flex items-center justify-between">
                      <span>Sunday (Sun) Rate *</span>
                      <span className="text-[10px] text-amber-800 font-normal">Weekend</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-on-surface-variant font-semibold mb-0.5">Regular (₹/hr)</span>
                        <input
                          type="number"
                          required
                          min={100}
                          value={newSunPrice}
                          onChange={e => setNewSunPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300 py-1"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-emerald-800 font-semibold mb-0.5">Offer Price (Optional)</span>
                        <input
                          type="number"
                          placeholder="e.g. 1400"
                          min={0}
                          value={newSunOfferPrice}
                          onChange={e => setNewSunOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 bg-white border-emerald-300 py-1"
                        />
                      </div>
                    </div>
                    {newSunOfferPrice !== '' && Number(newSunOfferPrice) > 0 && Number(newSunOfferPrice) !== Number(newSunPrice) && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 pt-0.5 border-t border-emerald-100">
                        <span className="line-through text-on-surface-variant/70">₹{Math.max(Number(newSunPrice), Number(newSunOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold">₹{Math.min(Number(newSunPrice), Number(newSunOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded-full font-black">
                          {Math.round(((Math.abs(Number(newSunPrice) - Number(newSunOfferPrice))) / Math.max(Number(newSunPrice), Number(newSunOfferPrice))) * 100)}% OFF
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Peak Hours Configuration Box */}
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-300/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-headline font-bold text-xs text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Zap className="w-4 h-4 text-amber-600 fill-amber-500" /> Peak Hours & Peak Rate Setup
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPeakEnabled}
                      onChange={e => setNewPeakEnabled(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    Enable Peak Hours
                  </label>
                </div>

                {newPeakEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak Start *</label>
                        <select
                          value={newPeakStart}
                          onChange={e => setNewPeakStart(e.target.value)}
                          className="form-input font-bold text-amber-950 border-amber-300"
                        >
                          <option value="16:00">04:00 PM</option>
                          <option value="17:00">05:00 PM</option>
                          <option value="18:00">06:00 PM (Standard Evening)</option>
                          <option value="19:00">07:00 PM</option>
                          <option value="20:00">08:00 PM</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak End *</label>
                        <select
                          value={newPeakEnd}
                          onChange={e => setNewPeakEnd(e.target.value)}
                          className="form-input font-bold text-amber-950 border-amber-300"
                        >
                          <option value="20:00">08:00 PM</option>
                          <option value="21:00">09:00 PM</option>
                          <option value="22:00">10:00 PM</option>
                          <option value="23:00">11:00 PM (Night Closing)</option>
                          <option value="00:00">12:00 AM (Midnight)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak Rate (₹/hr) *</label>
                        <input
                          type="number"
                          required
                          min={100}
                          value={newPeakPrice}
                          onChange={e => setNewPeakPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-950 border-amber-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-emerald-800 font-headline font-bold mb-1">Offer Price (Optional)</label>
                        <input
                          type="number"
                          placeholder="e.g. 1500"
                          min={0}
                          value={newPeakOfferPrice}
                          onChange={e => setNewPeakOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 border-emerald-400 bg-white"
                        />
                      </div>
                    </div>

                    {newPeakOfferPrice !== '' && Number(newPeakOfferPrice) > 0 && Number(newPeakOfferPrice) !== Number(newPeakPrice) && (
                      <div className="flex items-center gap-2 pt-1 text-xs font-bold text-emerald-800 border-t border-amber-200">
                        <span>Peak UI Preview:</span>
                        <span className="line-through text-on-surface-variant">₹{Math.max(Number(newPeakPrice), Number(newPeakOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold text-sm">₹{Math.min(Number(newPeakPrice), Number(newPeakOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                          {Math.round(((Math.abs(Number(newPeakPrice) - Number(newPeakOfferPrice))) / Math.max(Number(newPeakPrice), Number(newPeakOfferPrice))) * 100)}% OFF (Save ₹{Math.abs(Number(newPeakPrice) - Number(newPeakOfferPrice))})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Slot Duration *</label>
                <select
                  value={newDuration}
                  onChange={e => setNewDuration(Number(e.target.value))}
                  className="form-input font-bold"
                >
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={90}>90 Minutes</option>
                  <option value={120}>120 Minutes</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Opening Time *</label>
                  <select
                    value={newOpening}
                    onChange={e => setNewOpening(e.target.value)}
                    className="form-input font-bold"
                  >
                    <option value="05:00">05:00 AM</option>
                    <option value="05:30">05:30 AM</option>
                    <option value="06:00">06:00 AM (Standard)</option>
                    <option value="06:30">06:30 AM</option>
                    <option value="07:00">07:00 AM</option>
                    <option value="07:30">07:30 AM</option>
                    <option value="08:00">08:00 AM</option>
                    <option value="08:30">08:30 AM</option>
                    <option value="09:00">09:00 AM</option>
                    <option value="09:30">09:30 AM</option>
                    <option value="10:00">10:00 AM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Closing Time *</label>
                  <select
                    value={newClosing}
                    onChange={e => setNewClosing(e.target.value)}
                    className="form-input font-bold"
                  >
                    <option value="20:00">08:00 PM (20:00)</option>
                    <option value="21:00">09:00 PM (21:00)</option>
                    <option value="22:00">10:00 PM (22:00)</option>
                    <option value="23:00">11:00 PM (23:00 Night)</option>
                    <option value="23:30">11:30 PM</option>
                    <option value="00:00">12:00 AM (Midnight)</option>
                    <option value="01:00">01:00 AM</option>
                    <option value="02:00">02:00 AM (Late Night)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Buffer (Mins)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newBuffer}
                    onChange={e => setNewBuffer(Number(e.target.value))}
                    className="form-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Initial Status</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as any)}
                  className="form-input"
                >
                  <option value="active">Active (Available for booking)</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddCourtModal(false)}
                  className="btn-secondary flex-1 py-2.5 font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5 font-headline font-bold">
                  Save & Launch Pitch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Court Modal */}
      {editingCourt && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
              <h3 className="font-headline font-bold text-xl text-primary flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-primary" /> Edit Pitch Configuration
              </h3>
              <button onClick={() => setEditingCourt(null)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCourt} className="space-y-4 text-xs">
              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Pitch Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1.5">Supported Sports *</label>
                <div className="flex flex-wrap gap-2">
                  {sports.map(s => {
                    const isSelected = editSportIds.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleSportSelection(s.id, true)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary'
                        }`}
                      >
                        <span>{s.icon}</span>
                        <span>{s.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        {!PREDEFINED_SPORT_IDS.includes(s.id) && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleDeleteCustomSport(s.id, s.name, e)}
                            className="ml-1 p-0.5 hover:bg-red-500/30 hover:text-red-200 rounded-full transition-colors cursor-pointer"
                            title={`Delete ${s.name} custom sport`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowAddCustomSportEdit(prev => !prev)}
                    className="px-3 py-1.5 rounded-lg border border-dashed border-primary text-primary bg-primary/5 hover:bg-primary/10 text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <span>➕</span>
                    <span>Other / Custom Sport</span>
                  </button>
                </div>

                {showAddCustomSportEdit && (
                  <div className="bg-primary/5 border border-primary/20 p-3.5 rounded-xl space-y-3 mt-2.5 animate-modalScaleIn">
                    <div>
                      <span className="text-[11px] font-bold text-primary uppercase tracking-wider block mb-1.5">
                        ⚡ Quick 1-Click Sports
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: 'Volleyball', icon: '🏐' },
                          { name: 'Basketball', icon: '🏀' },
                          { name: 'Futsal', icon: '⚽' },
                          { name: 'Padel', icon: '🎾' },
                          { name: 'Squash', icon: '🏸' },
                          { name: 'Kabaddi', icon: '🤼' }
                        ].map(preset => (
                          <button
                            type="button"
                            key={preset.name}
                            onClick={() => addPresetSport(preset.name, preset.icon, true)}
                            className="bg-white hover:bg-primary/10 border border-outline-variant/50 text-on-surface text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <span>{preset.icon}</span>
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/30 pt-2.5">
                      <span className="text-[11px] font-bold text-on-surface block mb-1">
                        Or Type Custom Sport Name:
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type Sport Name (e.g. Volleyball, Swimming, Archery)"
                          value={customSportName}
                          onChange={e => setCustomSportName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCreateCustomSport(true, e as any);
                            }
                          }}
                          className="form-input text-xs flex-1 py-1.5 font-medium"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCreateCustomSport(true, e);
                          }}
                          className="btn-primary text-xs px-3.5 py-1.5 font-bold shrink-0 shadow-sm"
                        >
                          + Add Sport
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Day-based Pricing Configuration Box */}
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40 space-y-2.5">
                <h4 className="font-headline font-bold text-xs text-primary flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-primary" /> Weekday & Weekend Base Rates
                </h4>

                {/* Strikethrough Discount Configuration */}
                <div className="bg-emerald-50/70 border border-emerald-300/70 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-950 font-bold text-xs">
                    <Tag className="w-4 h-4 text-emerald-700" />
                    <span>Customer Discount & Strikethrough Pricing</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-on-surface-variant font-headline font-bold text-[11px] mb-1">
                        Original Price / MRP (₹/hr)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 1500"
                        min={0}
                        value={editOriginalPrice}
                        onChange={e => setEditOriginalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="form-input font-bold text-on-surface-variant bg-white"
                      />
                      <span className="text-[10px] text-on-surface-variant/70 block mt-0.5">
                        Will show as strikethrough (cut out) on the website
                      </span>
                    </div>

                    <div>
                      <label className="block text-emerald-900 font-headline font-bold text-[11px] mb-1">
                        Discounted / Active Price (₹/hr) *
                      </label>
                      <input
                        type="number"
                        required
                        min={100}
                        value={editPrice}
                        onChange={e => setEditPrice(Number(e.target.value))}
                        className="form-input font-bold text-emerald-900 bg-white border-emerald-400"
                      />
                      <span className="text-[10px] text-emerald-700 block mt-0.5">
                        Actual booking price charged to customers
                      </span>
                    </div>
                  </div>

                  {Number(editOriginalPrice) > Number(editPrice) && (
                    <div className="flex items-center gap-2 pt-1 text-xs font-bold text-emerald-800 border-t border-emerald-200/60">
                      <span>UI Preview:</span>
                      <span className="line-through text-on-surface-variant">₹{editOriginalPrice}</span>
                      <span className="text-emerald-900 font-extrabold text-sm">₹{editPrice}/hr</span>
                      <span className="bg-emerald-200/70 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                        {Math.round(((Number(editOriginalPrice) - Number(editPrice)) / Number(editOriginalPrice)) * 100)}% OFF (Save ₹{Number(editOriginalPrice) - Number(editPrice)})
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Saturday */}
                  <div className="bg-white p-3 rounded-xl border border-amber-300/70 shadow-xs space-y-1.5">
                    <label className="block text-amber-950 font-headline font-bold text-xs flex items-center justify-between">
                      <span>Saturday (Sat) Rate *</span>
                      <span className="text-[10px] text-amber-800 font-normal">Weekend</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-on-surface-variant font-semibold mb-0.5">Regular (₹/hr)</span>
                        <input
                          type="number"
                          required
                          min={100}
                          value={editSatPrice}
                          onChange={e => setEditSatPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300 py-1"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-emerald-800 font-semibold mb-0.5">Offer Price (Optional)</span>
                        <input
                          type="number"
                          placeholder="e.g. 1400"
                          min={0}
                          value={editSatOfferPrice}
                          onChange={e => setEditSatOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 bg-white border-emerald-300 py-1"
                        />
                      </div>
                    </div>
                    {editSatOfferPrice !== '' && Number(editSatOfferPrice) > 0 && Number(editSatOfferPrice) !== Number(editSatPrice) && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 pt-0.5 border-t border-emerald-100">
                        <span className="line-through text-on-surface-variant/70">₹{Math.max(Number(editSatPrice), Number(editSatOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold">₹{Math.min(Number(editSatPrice), Number(editSatOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded-full font-black">
                          {Math.round(((Math.abs(Number(editSatPrice) - Number(editSatOfferPrice))) / Math.max(Number(editSatPrice), Number(editSatOfferPrice))) * 100)}% OFF
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sunday */}
                  <div className="bg-white p-3 rounded-xl border border-amber-300/70 shadow-xs space-y-1.5">
                    <label className="block text-amber-950 font-headline font-bold text-xs flex items-center justify-between">
                      <span>Sunday (Sun) Rate *</span>
                      <span className="text-[10px] text-amber-800 font-normal">Weekend</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-on-surface-variant font-semibold mb-0.5">Regular (₹/hr)</span>
                        <input
                          type="number"
                          required
                          min={100}
                          value={editSunPrice}
                          onChange={e => setEditSunPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300 py-1"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-emerald-800 font-semibold mb-0.5">Offer Price (Optional)</span>
                        <input
                          type="number"
                          placeholder="e.g. 1400"
                          min={0}
                          value={editSunOfferPrice}
                          onChange={e => setEditSunOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 bg-white border-emerald-300 py-1"
                        />
                      </div>
                    </div>
                    {editSunOfferPrice !== '' && Number(editSunOfferPrice) > 0 && Number(editSunOfferPrice) !== Number(editSunPrice) && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 pt-0.5 border-t border-emerald-100">
                        <span className="line-through text-on-surface-variant/70">₹{Math.max(Number(editSunPrice), Number(editSunOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold">₹{Math.min(Number(editSunPrice), Number(editSunOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded-full font-black">
                          {Math.round(((Math.abs(Number(editSunPrice) - Number(editSunOfferPrice))) / Math.max(Number(editSunPrice), Number(editSunOfferPrice))) * 100)}% OFF
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Peak Hours Configuration Box */}
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-300/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-headline font-bold text-xs text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Zap className="w-4 h-4 text-amber-600 fill-amber-500" /> Peak Hours & Peak Rate Setup
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPeakEnabled}
                      onChange={e => setEditPeakEnabled(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    Enable Peak Hours
                  </label>
                </div>

                {editPeakEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak Start *</label>
                        <select
                          value={editPeakStart}
                          onChange={e => setEditPeakStart(e.target.value)}
                          className="form-input font-bold text-amber-950 border-amber-300"
                        >
                          <option value="16:00">04:00 PM</option>
                          <option value="17:00">05:00 PM</option>
                          <option value="18:00">06:00 PM (Standard Evening)</option>
                          <option value="19:00">07:00 PM</option>
                          <option value="20:00">08:00 PM</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak End *</label>
                        <select
                          value={editPeakEnd}
                          onChange={e => setEditPeakEnd(e.target.value)}
                          className="form-input font-bold text-amber-950 border-amber-300"
                        >
                          <option value="20:00">08:00 PM</option>
                          <option value="21:00">09:00 PM</option>
                          <option value="22:00">10:00 PM</option>
                          <option value="23:00">11:00 PM (Night Closing)</option>
                          <option value="00:00">12:00 AM (Midnight)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-amber-900 font-headline font-bold mb-1">Peak Rate (₹/hr) *</label>
                        <input
                          type="number"
                          required
                          min={100}
                          value={editPeakPrice}
                          onChange={e => setEditPeakPrice(Number(e.target.value))}
                          className="form-input font-bold text-amber-950 border-amber-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-emerald-800 font-headline font-bold mb-1">Offer Price (Optional)</label>
                        <input
                          type="number"
                          placeholder="e.g. 1500"
                          min={0}
                          value={editPeakOfferPrice}
                          onChange={e => setEditPeakOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="form-input font-bold text-emerald-900 border-emerald-400 bg-white"
                        />
                      </div>
                    </div>

                    {editPeakOfferPrice !== '' && Number(editPeakOfferPrice) > 0 && Number(editPeakOfferPrice) !== Number(editPeakPrice) && (
                      <div className="flex items-center gap-2 pt-1 text-xs font-bold text-emerald-800 border-t border-amber-200">
                        <span>Peak UI Preview:</span>
                        <span className="line-through text-on-surface-variant">₹{Math.max(Number(editPeakPrice), Number(editPeakOfferPrice))}</span>
                        <span className="text-emerald-900 font-extrabold text-sm">₹{Math.min(Number(editPeakPrice), Number(editPeakOfferPrice))}/hr</span>
                        <span className="bg-emerald-200/70 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                          {Math.round(((Math.abs(Number(editPeakPrice) - Number(editPeakOfferPrice))) / Math.max(Number(editPeakPrice), Number(editPeakOfferPrice))) * 100)}% OFF (Save ₹{Math.abs(Number(editPeakPrice) - Number(editPeakOfferPrice))})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Slot Duration *</label>
                <select
                  value={editDuration}
                  onChange={e => setEditDuration(Number(e.target.value))}
                  className="form-input font-bold"
                >
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={90}>90 Minutes</option>
                  <option value={120}>120 Minutes</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Opening Time *</label>
                  <select
                    value={editOpening}
                    onChange={e => setEditOpening(e.target.value)}
                    className="form-input font-bold"
                  >
                    <option value="05:00">05:00 AM</option>
                    <option value="05:30">05:30 AM</option>
                    <option value="06:00">06:00 AM (Standard)</option>
                    <option value="06:30">06:30 AM</option>
                    <option value="07:00">07:00 AM</option>
                    <option value="07:30">07:30 AM</option>
                    <option value="08:00">08:00 AM</option>
                    <option value="08:30">08:30 AM</option>
                    <option value="09:00">09:00 AM</option>
                    <option value="09:30">09:30 AM</option>
                    <option value="10:00">10:00 AM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Closing Time *</label>
                  <select
                    value={editClosing}
                    onChange={e => setEditClosing(e.target.value)}
                    className="form-input font-bold"
                  >
                    <option value="20:00">08:00 PM (20:00)</option>
                    <option value="21:00">09:00 PM (21:00)</option>
                    <option value="22:00">10:00 PM (22:00)</option>
                    <option value="23:00">11:00 PM (23:00 Night)</option>
                    <option value="23:30">11:30 PM</option>
                    <option value="00:00">12:00 AM (Midnight)</option>
                    <option value="01:00">01:00 AM</option>
                    <option value="02:00">02:00 AM (Late Night)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">Buffer (Mins)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editBuffer}
                    onChange={e => setEditBuffer(Number(e.target.value))}
                    className="form-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as any)}
                  className="form-input"
                >
                  <option value="active">Active (Available for booking)</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCourt(null)}
                  className="btn-secondary flex-1 py-2.5 font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5 font-headline font-bold">
                  Update Pitch Specs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block Slot Modal */}
      {showBlockModal && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
              <h3 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-700" /> Block Pitch for Maintenance / Event
              </h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" /> Multi-Day & Time-Windowed Outage Management
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Specify the exact start date & time and end date & time. The system will automatically block all overlapping slots across the Customer Website, WhatsApp AI Agent, and Counter booking calendar.
              </p>
            </div>

            <form onSubmit={handleCreateBlock} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Select Pitch / Arena *</label>
                <select
                  value={blockCourtId}
                  onChange={e => setBlockCourtId(e.target.value)}
                  className="form-input font-bold"
                >
                  {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Maintenance Start Schedule */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <p className="font-headline font-bold text-gray-800 flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> Maintenance Start Schedule *
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-600 font-semibold mb-1">Start Date *</label>
                    <input
                      type="date"
                      required
                      value={blockStartDate}
                      onChange={e => {
                        const newStart = e.target.value;
                        setBlockStartDate(newStart);
                        if (blockEndDate < newStart) {
                          setBlockEndDate(newStart);
                        }
                      }}
                      className="form-input text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 font-semibold mb-1">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={blockStartTime}
                      onChange={e => setBlockStartTime(e.target.value)}
                      className="form-input text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Maintenance End Schedule */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <p className="font-headline font-bold text-gray-800 flex items-center gap-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-amber-700" /> Maintenance End Schedule *
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-600 font-semibold mb-1">End Date *</label>
                    <input
                      type="date"
                      required
                      min={blockStartDate}
                      value={blockEndDate}
                      onChange={e => setBlockEndDate(e.target.value)}
                      className="form-input text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 font-semibold mb-1">End Time *</label>
                    <input
                      type="time"
                      required
                      value={blockEndTime}
                      onChange={e => setBlockEndTime(e.target.value)}
                      className="form-input text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Reason for Blocking *</label>
                <select
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value as any)}
                  className="form-input font-medium"
                >
                  <option value="maintenance">🛠️ Pitch Maintenance, Turf Brushing & Repairs</option>
                  <option value="private_event">🏆 Private Tournament / League Match</option>
                  <option value="owner_block">🔒 Venue Owner Personal Reservation</option>
                </select>
              </div>

              {/* Live Interval Preview & Validation Banner */}
              {(() => {
                const isInvalidSequence = blockEndDate < blockStartDate || (blockEndDate === blockStartDate && blockEndTime <= blockStartTime);
                if (isInvalidSequence) {
                  return (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>End Date & Time must be after Start Date & Time.</span>
                    </div>
                  );
                }

                // Check for booking conflict live in the modal
                const liveConflict = store.getBookings().find(b =>
                  b.court_id === blockCourtId &&
                  (b.status === 'confirmed' || b.status === 'pending_payment') &&
                  PostgresEngine.isDateTimeOverlap(
                    b.booking_date,
                    b.start_time,
                    b.end_time,
                    blockStartDate,
                    blockStartTime,
                    blockEndDate,
                    blockEndTime
                  )
                );

                if (liveConflict) {
                  return (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" /> Active Booking Conflict Detected
                      </p>
                      <p className="text-[11px] text-amber-800">
                        Booking <strong className="font-mono">{liveConflict.booking_ref}</strong> ({liveConflict.customer_name}) is scheduled on {formatDateDDMMYYYY(liveConflict.booking_date)} ({formatTime12hPlain(liveConflict.start_time)} – {formatTime12hPlain(liveConflict.end_time)}). Please reschedule or cancel it first.
                      </p>
                    </div>
                  );
                }

                const isSingleDay = blockStartDate === blockEndDate;
                return (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {isSingleDay
                        ? `Pitch will be blocked on ${formatDateDDMMYYYY(blockStartDate)} from ${formatTime12hPlain(blockStartTime)} to ${formatTime12hPlain(blockEndTime)}.`
                        : `Pitch will be blocked from ${formatDateDDMMYYYY(blockStartDate)} (${formatTime12hPlain(blockStartTime)}) to ${formatDateDDMMYYYY(blockEndDate)} (${formatTime12hPlain(blockEndTime)}).`}
                    </span>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="btn-secondary flex-1 py-2.5 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={blockEndDate < blockStartDate || (blockEndDate === blockStartDate && blockEndTime <= blockStartTime)}
                  className="btn-primary flex-1 py-2.5 font-headline font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Occasion / Flash Sale Offer Modal */}
      {showOccasionOfferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto border border-outline-variant/30">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-outline-variant/40 pb-4">
              <div>
                <h3 className="font-headline font-bold text-lg text-emerald-950 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" /> Apply Occasion / Flash Sale Offer
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
                  Update prices by a discount percentage (e.g. 10% OFF) with 1 click. Automatically updates pitch rates and displays pre-discount MRP strikethroughs across the site.
                </p>
              </div>
              <button
                onClick={() => setShowOccasionOfferModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Quick 1-Click Discount Presets */}
              <div>
                <label className="block text-on-surface-variant font-headline font-bold text-xs mb-1.5">
                  Select Discount Percentage (1-Click Presets) *
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  {[5, 10, 15, 20, 25, 30, 50].map(pct => {
                    const isSelected = offerPercentage === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setOfferPercentage(pct)}
                        className={`px-3 py-1.5 rounded-xl font-headline font-bold text-xs transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500 ring-offset-1 scale-105'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        {pct}% OFF {pct === 10 && '⭐ (Popular)'}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs font-bold text-on-surface-variant">Custom:</span>
                    <div className="relative w-24">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={offerPercentage}
                        onChange={e => setOfferPercentage(Math.max(1, Math.min(99, Number(e.target.value) || 0)))}
                        className="form-input text-xs font-extrabold pr-6 text-center"
                      />
                      <Percent className="w-3.5 h-3.5 text-on-surface-variant absolute right-2 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Occasion Label / Name (Optional) */}
              <div>
                <label className="block text-on-surface-variant font-headline font-bold text-xs mb-1.5">
                  Occasion / Offer Tag (Optional)
                </label>
                <input
                  type="text"
                  value={offerOccasionName}
                  onChange={e => setOfferOccasionName(e.target.value)}
                  placeholder="e.g. Diwali Flash Sale, Weekend Blast, IPL Special"
                  className="form-input text-xs font-medium"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['Diwali Dhamaka', 'Weekend Flash Deal', 'Tournament Special', 'Summer League', 'Monsoon Offer'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setOfferOccasionName(preset)}
                      className="text-[10px] bg-surface-container-low hover:bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full border border-outline-variant/40 transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Target Pitches Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-on-surface-variant font-headline font-bold text-xs">
                    Target Pitches ({selectedCourtIdsForOffer.length} of {courts.length} Selected) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCourtIdsForOffer.length === courts.length) {
                        setSelectedCourtIdsForOffer([]);
                      } else {
                        setSelectedCourtIdsForOffer(courts.map(c => c.id));
                      }
                    }}
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    {selectedCourtIdsForOffer.length === courts.length ? 'Deselect All' : 'Select All Pitches'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {courts.map(court => {
                    const isChecked = selectedCourtIdsForOffer.includes(court.id);
                    return (
                      <label
                        key={court.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-semibold'
                            : 'bg-white border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedCourtIdsForOffer(prev => [...prev, court.id]);
                            } else {
                              setSelectedCourtIdsForOffer(prev => prev.filter(id => id !== court.id));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-bold text-on-surface">{court.name}</p>
                          <p className="text-[10px] text-on-surface-variant truncate">
                            Base: ₹{court.base_price_per_hour}/hr | Sat: ₹{court.saturday_price_per_hour ?? court.base_price_per_hour} | Sun: ₹{court.sunday_price_per_hour ?? court.base_price_per_hour}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 4. Rates to Discount */}
              <div>
                <label className="block text-on-surface-variant font-headline font-bold text-xs mb-1.5">
                  Apply {offerPercentage}% Discount To Rates *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                    offerRateTypes.weekday ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant'
                  }`}>
                    <input
                      type="checkbox"
                      checked={offerRateTypes.weekday}
                      onChange={e => setOfferRateTypes(prev => ({ ...prev, weekday: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Weekday (Mon-Fri)</span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                    offerRateTypes.saturday ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant'
                  }`}>
                    <input
                      type="checkbox"
                      checked={offerRateTypes.saturday}
                      onChange={e => setOfferRateTypes(prev => ({ ...prev, saturday: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Saturday</span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                    offerRateTypes.sunday ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant'
                  }`}>
                    <input
                      type="checkbox"
                      checked={offerRateTypes.sunday}
                      onChange={e => setOfferRateTypes(prev => ({ ...prev, sunday: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Sunday</span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                    offerRateTypes.peak ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant'
                  }`}>
                    <input
                      type="checkbox"
                      checked={offerRateTypes.peak}
                      onChange={e => setOfferRateTypes(prev => ({ ...prev, peak: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Peak Hours</span>
                  </label>
                </div>
              </div>

              {/* 5. Live Real-Time Impact & Preview Table */}
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-headline font-bold text-xs text-on-surface flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-600" /> Live Rate Preview ({offerPercentage}% OFF)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-extrabold bg-emerald-100 px-2 py-0.5 rounded-full">
                    {selectedCourtIdsForOffer.length} Pitch(es) Selected
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="border-b border-outline-variant/40 text-on-surface-variant font-bold">
                        <th className="py-1.5 pr-2">Pitch</th>
                        {offerRateTypes.weekday && <th className="py-1.5 px-2">Weekday</th>}
                        {offerRateTypes.saturday && <th className="py-1.5 px-2">Saturday</th>}
                        {offerRateTypes.sunday && <th className="py-1.5 px-2">Sunday</th>}
                        {offerRateTypes.peak && <th className="py-1.5 px-2">Peak Hours</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {courts.filter(c => selectedCourtIdsForOffer.includes(c.id)).map(court => {
                        const preview = calculateOfferPricingForCourt(court, offerPercentage, offerRateTypes);
                        return (
                          <tr key={court.id} className="hover:bg-white/50">
                            <td className="py-1.5 pr-2 font-bold text-on-surface">{court.name}</td>
                            {offerRateTypes.weekday && (
                              <td className="py-1.5 px-2">
                                <span className="line-through text-on-surface-variant/70 mr-1">₹{preview.origWeekday}</span>
                                <strong className="text-emerald-700">₹{preview.newBasePrice}</strong>
                              </td>
                            )}
                            {offerRateTypes.saturday && (
                              <td className="py-1.5 px-2">
                                <span className="line-through text-on-surface-variant/70 mr-1">₹{preview.baseSat}</span>
                                <strong className="text-emerald-700">₹{preview.newSatOfferPrice}</strong>
                              </td>
                            )}
                            {offerRateTypes.sunday && (
                              <td className="py-1.5 px-2">
                                <span className="line-through text-on-surface-variant/70 mr-1">₹{preview.baseSun}</span>
                                <strong className="text-emerald-700">₹{preview.newSunOfferPrice}</strong>
                              </td>
                            )}
                            {offerRateTypes.peak && (
                              <td className="py-1.5 px-2">
                                {court.peak_enabled ? (
                                  <>
                                    <span className="line-through text-on-surface-variant/70 mr-1">₹{preview.basePeak}</span>
                                    <strong className="text-emerald-700">₹{preview.newPeakOfferPrice}</strong>
                                  </>
                                ) : (
                                  <span className="text-on-surface-variant/60 italic">N/A</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setShowOccasionOfferModal(false)}
                  className="btn-secondary flex-1 py-2.5 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedCourtIdsForOffer.length === 0 || isApplyingOffer}
                  onClick={handleApplyOccasionOffer}
                  className="btn-primary flex-1 py-2.5 font-headline font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplyingOffer ? (
                    <span>Applying {offerPercentage}% Offer...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Apply {offerPercentage}% Offer ({selectedCourtIdsForOffer.length} Pitches)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Universal Confirmation Modal (Rendered at top-most z-index overlay level) */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
};
