import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, Court, BlockedSlot, Sport } from '../../types/schema';
import { ConfirmModal } from '../common/ConfirmModal';
import { Settings, ShieldAlert, Trash2, PlusCircle, Edit3, X, Check, Calendar, Zap } from 'lucide-react';

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
  const [newPrice, setNewPrice] = useState(1200);
  const [newSatPrice, setNewSatPrice] = useState(1600);
  const [newSunPrice, setNewSunPrice] = useState(1600);
  const [newPeakEnabled, setNewPeakEnabled] = useState(true);
  const [newPeakStart, setNewPeakStart] = useState('18:00');
  const [newPeakEnd, setNewPeakEnd] = useState('23:00');
  const [newPeakPrice, setNewPeakPrice] = useState(1800);
  const [newDuration, setNewDuration] = useState(60);
  const [newOpening, setNewOpening] = useState('06:00');
  const [newClosing, setNewClosing] = useState('23:00');
  const [newBuffer, setNewBuffer] = useState(0);
  const [newStatus, setNewStatus] = useState<'active' | 'maintenance' | 'inactive'>('active');

  // Edit Court Modal State
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editName, setEditName] = useState('');
  const [editSportIds, setEditSportIds] = useState<string[]>([]);
  const [editPrice, setEditPrice] = useState(1200);
  const [editSatPrice, setEditSatPrice] = useState(1600);
  const [editSunPrice, setEditSunPrice] = useState(1600);
  const [editPeakEnabled, setEditPeakEnabled] = useState(true);
  const [editPeakStart, setEditPeakStart] = useState('18:00');
  const [editPeakEnd, setEditPeakEnd] = useState('23:00');
  const [editPeakPrice, setEditPeakPrice] = useState(1800);
  const [editDuration, setEditDuration] = useState(60);
  const [editOpening, setEditOpening] = useState('06:00');
  const [editClosing, setEditClosing] = useState('23:00');
  const [editBuffer, setEditBuffer] = useState(0);
  const [editStatus, setEditStatus] = useState<'active' | 'maintenance' | 'inactive'>('active');

  // Block slot form state
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockCourtId, setBlockCourtId] = useState(courts[0]?.id || '');
  const [blockDate, setBlockDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockStart, setBlockStart] = useState('14:00');
  const [blockReason, setBlockReason] = useState<'maintenance' | 'private_event' | 'owner_block'>('maintenance');

  const canEdit = true; // Add, Edit, and Delete features enabled for Admin Panel

  const executeAddCourt = () => {
    const newCourt: Court = {
      id: `crt-${Date.now()}`,
      venue_id: store.getVenue().id,
      name: newCourtName.trim(),
      sport_ids: selectedSportIds,
      base_price_per_hour: Number(newPrice) || 1000,
      saturday_price_per_hour: Number(newSatPrice) || Number(newPrice) || 1200,
      sunday_price_per_hour: Number(newSunPrice) || Number(newPrice) || 1200,
      peak_enabled: newPeakEnabled,
      peak_start_time: newPeakStart,
      peak_end_time: newPeakEnd,
      peak_price_per_hour: Number(newPeakPrice) || 1800,
      slot_duration_minutes: Number(newDuration) || 60,
      opening_time: newOpening || '06:00',
      closing_time: newClosing || '23:00',
      buffer_minutes: Number(newBuffer) || 0,
      status: newStatus
    };

    const updatedCourts = [...courts, newCourt];
    store.setCourts(updatedCourts);
    setCourts(updatedCourts);

    AuditLogger.log(currentAdmin.id, 'CREATE_COURT', 'Court', newCourt.id, null, newCourt);

    setNewCourtName('');
    setNewPrice(1200);
    setNewSatPrice(1600);
    setNewSunPrice(1600);
    setShowAddCourtModal(false);
    closeConfirm();
  };

  const handleAddCourt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourtName.trim()) {
      alert('Please enter a valid court / pitch name');
      return;
    }

    if (selectedSportIds.length === 0) {
      alert('Please select at least one sport for this court');
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
    setEditPrice(court.base_price_per_hour);
    setEditSatPrice(court.saturday_price_per_hour ?? court.base_price_per_hour);
    setEditSunPrice(court.sunday_price_per_hour ?? court.base_price_per_hour);
    setEditPeakEnabled(court.peak_enabled ?? true);
    setEditPeakStart(court.peak_start_time || '18:00');
    setEditPeakEnd(court.peak_end_time || '23:00');
    setEditPeakPrice(court.peak_price_per_hour || 1800);
    setEditDuration(court.slot_duration_minutes);
    setEditOpening(court.opening_time);
    setEditClosing(court.closing_time);
    setEditBuffer(court.buffer_minutes);
    setEditStatus(court.status);
  };

  const executeUpdateCourt = () => {
    if (!editingCourt) return;
    const updatedCourt: Court = {
      ...editingCourt,
      name: editName.trim(),
      sport_ids: editSportIds,
      base_price_per_hour: Number(editPrice),
      saturday_price_per_hour: Number(editSatPrice),
      sunday_price_per_hour: Number(editSunPrice),
      peak_enabled: editPeakEnabled,
      peak_start_time: editPeakStart,
      peak_end_time: editPeakEnd,
      peak_price_per_hour: Number(editPeakPrice),
      slot_duration_minutes: Number(editDuration),
      opening_time: editOpening,
      closing_time: editClosing,
      buffer_minutes: Number(editBuffer),
      status: editStatus
    };

    const updatedCourts = courts.map(c => (c.id === editingCourt.id ? updatedCourt : c));
    store.setCourts(updatedCourts);
    setCourts(updatedCourts);

    AuditLogger.log(currentAdmin.id, 'UPDATE_COURT', 'Court', editingCourt.id, editingCourt, updatedCourt);
    setEditingCourt(null);
    closeConfirm();
  };

  const handleUpdateCourt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourt) return;

    if (!editName.trim()) {
      alert('Please enter a valid pitch name');
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
      date: blockDate,
      start_time: blockStart,
      reason: blockReason,
      created_by_admin_id: currentAdmin.id
    };

    const updated = [...blockedSlots, newBlock];
    store.setBlockedSlots(updated);
    setBlockedSlots(updated);
    AuditLogger.log(currentAdmin.id, 'CREATE_BLOCKED_SLOT', 'BlockedSlot', newBlock.id, null, newBlock);
    setShowBlockModal(false);
    closeConfirm();
  };

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const court = courts.find(c => c.id === blockCourtId);

    setConfirmState({
      isOpen: true,
      title: 'Confirm Pitch Maintenance Block',
      message: `Block ${court?.name || 'Pitch'} on ${blockDate} at ${blockStart} for reason: ${blockReason.toUpperCase()}?`,
      confirmText: 'Confirm Block',
      variant: 'warning',
      onConfirm: executeCreateBlock
    });
  };

  const handleDeleteBlock = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Maintenance Block',
      message: 'Are you sure you want to unblock this slot and make it available for booking again?',
      confirmText: 'Unblock Slot',
      variant: 'success',
      onConfirm: () => {
        const updated = blockedSlots.filter(b => b.id !== id);
        store.setBlockedSlots(updated);
        setBlockedSlots(updated);
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

            return (
              <div key={court.id} className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-3 relative group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-headline font-bold text-base text-on-surface leading-snug">{court.name}</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {courtSports.map(s => (
                        <span key={s.id} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {s.icon} {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs font-headline font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg shrink-0">
                    Mon-Fri: ₹{court.base_price_per_hour}/hr
                  </span>
                </div>

                {/* Pricing Rules Overview Badges */}
                <div className="bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-lg space-y-2 text-xs font-headline">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-700" /> Weekend Rates:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded text-[11px]">
                        Sat: ₹{satPrice}/hr
                      </span>
                      <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded text-[11px]">
                        Sun: ₹{sunPrice}/hr
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
                        {court.peak_start_time} - {court.peak_end_time} (₹{court.peak_price_per_hour}/hr)
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
                    <strong className="text-on-surface font-semibold">{court.opening_time} – {court.closing_time}</strong>
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
                  <div className="pt-2 flex justify-end gap-3 border-t border-outline-variant/30">
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
              return (
                <div key={blk.id} className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/40 flex justify-between items-center">
                  <div>
                    <p className="font-headline font-bold text-on-surface">{court?.name || 'Pitch'}</p>
                    <p className="text-on-surface-variant text-[11px] font-medium">{blk.date} @ {blk.start_time}</p>
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 inline-block">
                      {blk.reason}
                    </span>
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleDeleteBlock(blk.id)}
                      className="p-2 text-red-600 hover:text-red-800"
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
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto">
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
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40 space-y-2.5">
                <h4 className="font-headline font-bold text-xs text-primary flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-primary" /> Weekday & Weekend Base Rates
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Weekday (Mon-Fri) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={newPrice}
                      onChange={e => setNewPrice(Number(e.target.value))}
                      className="form-input font-bold text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Saturday (Sat) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={newSatPrice}
                      onChange={e => setNewSatPrice(Number(e.target.value))}
                      className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300"
                    />
                  </div>
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Sunday (Sun) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={newSunPrice}
                      onChange={e => setNewSunPrice(Number(e.target.value))}
                      className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300"
                    />
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
                  <div className="grid grid-cols-3 gap-3 pt-1">
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
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto">
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Weekday (Mon-Fri) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={editPrice}
                      onChange={e => setEditPrice(Number(e.target.value))}
                      className="form-input font-bold text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Saturday (Sat) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={editSatPrice}
                      onChange={e => setEditSatPrice(Number(e.target.value))}
                      className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300"
                    />
                  </div>
                  <div>
                    <label className="block text-on-surface-variant font-headline font-bold mb-1">Sunday (Sun) *</label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={editSunPrice}
                      onChange={e => setEditSunPrice(Number(e.target.value))}
                      className="form-input font-bold text-amber-900 bg-amber-50/50 border-amber-300"
                    />
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
                  <div className="grid grid-cols-3 gap-3 pt-1">
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
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface max-h-[85vh] overflow-y-auto">
            <h3 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-700" /> Block Court Slot
            </h3>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Court</label>
                <select
                  value={blockCourtId}
                  onChange={e => setBlockCourtId(e.target.value)}
                  className="form-input"
                >
                  {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={e => setBlockDate(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Start Time *</label>
                <select
                  value={blockStart}
                  onChange={e => setBlockStart(e.target.value)}
                  className="form-input font-bold"
                >
                  <option value="06:00">06:00 AM</option>
                  <option value="07:00">07:00 AM</option>
                  <option value="08:00">08:00 AM</option>
                  <option value="09:00">09:00 AM</option>
                  <option value="10:00">10:00 AM</option>
                  <option value="11:00">11:00 AM</option>
                  <option value="12:00">12:00 PM (Noon)</option>
                  <option value="13:00">01:00 PM (13:00)</option>
                  <option value="14:00">02:00 PM (14:00)</option>
                  <option value="15:00">03:00 PM (15:00)</option>
                  <option value="16:00">04:00 PM (16:00)</option>
                  <option value="17:00">05:00 PM (17:00)</option>
                  <option value="18:00">06:00 PM (18:00)</option>
                  <option value="19:00">07:00 PM (19:00)</option>
                  <option value="20:00">08:00 PM (20:00)</option>
                  <option value="21:00">09:00 PM (21:00)</option>
                  <option value="22:00">10:00 PM (22:00)</option>
                </select>
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Reason</label>
                <select
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value as any)}
                  className="form-input"
                >
                  <option value="maintenance">Maintenance & Cleaning</option>
                  <option value="private_event">Private Tournament / Event</option>
                  <option value="owner_block">Owner Personal Block</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="btn-secondary flex-1 py-2.5 font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5 font-headline font-bold">
                  Confirm Block
                </button>
              </div>
            </form>
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
