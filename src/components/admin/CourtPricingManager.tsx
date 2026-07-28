import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, Court, BlockedSlot } from '../../types/schema';
import { Settings, ShieldAlert, Plus, Zap, AlertTriangle, Trash2 } from 'lucide-react';

interface CourtPricingManagerProps {
  currentAdmin: AdminUser;
}

export const CourtPricingManager: React.FC<CourtPricingManagerProps> = ({ currentAdmin }) => {
  const courts = store.getCourts();
  const blockedSlots = store.getBlockedSlots();
  const pricingRules = store.getPricingRules();

  // Block slot form state
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockCourtId, setBlockCourtId] = useState(courts[0]?.id || '');
  const [blockDate, setBlockDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockStart, setBlockStart] = useState('14:00');
  const [blockReason, setBlockReason] = useState<'maintenance' | 'private_event' | 'owner_block'>('maintenance');

  const canEdit = currentAdmin.role === 'owner' || currentAdmin.role === 'manager';

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      alert('Permission denied: Only Owners and Managers can block court slots.');
      return;
    }

    // Check if confirmed bookings exist in window
    const existing = store.getBookings().filter(
      b => b.court_id === blockCourtId && b.booking_date === blockDate && b.start_time === blockStart && (b.status === 'confirmed' || b.status === 'pending_payment')
    );

    if (existing.length > 0) {
      const confirmMsg = `WARNING: ${existing.length} active booking(s) exist on this slot! Creating this block will conflict with reference ${existing[0].booking_ref}. Proceed anyway?`;
      if (!confirm(confirmMsg)) return;
    }

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
    AuditLogger.log(currentAdmin.id, 'CREATE_BLOCKED_SLOT', 'BlockedSlot', newBlock.id, null, newBlock);
    setShowBlockModal(false);
  };

  const handleDeleteBlock = (id: string) => {
    if (!canEdit) return;
    const updated = blockedSlots.filter(b => b.id !== id);
    store.setBlockedSlots(updated);
    AuditLogger.log(currentAdmin.id, 'DELETE_BLOCKED_SLOT', 'BlockedSlot', id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#131b2e] p-4 rounded-xl border border-[#24304f]">
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" /> Court Settings & Pricing Rules
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Manage slot turnover buffers, peak rates, and schedule blocks.</p>
        </div>

        {canEdit && (
          <button
            onClick={() => setShowBlockModal(true)}
            className="btn btn-secondary text-xs flex items-center gap-1 border-amber-500/30 text-amber-300"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" /> + Block Slot / Maintenance
          </button>
        )}
      </div>

      {/* Courts List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {courts.map(court => (
          <div key={court.id} className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] space-y-3">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-white text-sm">{court.name}</h3>
              <span className="text-xs font-bold text-emerald-400">₹{court.base_price_per_hour}/hr</span>
            </div>

            <div className="text-xs space-y-1 text-gray-300 bg-[#0f172a] p-3 rounded-lg border border-[#24304f]">
              <p>Slot Duration: <strong className="text-white">{court.slot_duration_minutes} mins</strong></p>
              <p>Turnover Buffer: <strong className="text-emerald-400">{court.buffer_minutes} mins</strong></p>
              <p>Hours: <strong className="text-white">{court.opening_time} - {court.closing_time}</strong></p>
              <p>Status: <strong className="text-emerald-400 uppercase">{court.status}</strong></p>
            </div>
          </div>
        ))}
      </div>

      {/* Active Blocked Slots */}
      <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] space-y-3">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" /> Active Blocked Slots / Maintenance Days
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {blockedSlots.length === 0 ? (
            <p className="text-gray-400 py-4 col-span-2">No active blocked slots.</p>
          ) : (
            blockedSlots.map(blk => {
              const court = courts.find(c => c.id === blk.court_id);
              return (
                <div key={blk.id} className="bg-[#0f172a] p-3 rounded-lg border border-[#24304f] flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white">{court?.name}</p>
                    <p className="text-gray-400">{blk.date} @ {blk.start_time}</p>
                    <span className="badge badge-blocked mt-1 uppercase">{blk.reason}</span>
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleDeleteBlock(blk.id)}
                      className="p-2 text-red-400 hover:text-red-300"
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

      {/* Block Slot Modal */}
      {showBlockModal && (
        <div className="modal-backdrop">
          <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" /> Block Court Slot
            </h3>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Court</label>
                <select
                  value={blockCourtId}
                  onChange={e => setBlockCourtId(e.target.value)}
                  className="input-field"
                >
                  {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={e => setBlockDate(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Start Time</label>
                <input
                  type="text"
                  required
                  placeholder="14:00"
                  value={blockStart}
                  onChange={e => setBlockStart(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Reason</label>
                <select
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value as any)}
                  className="input-field"
                >
                  <option value="maintenance">Maintenance & Cleaning</option>
                  <option value="private_event">Private Tournament / Event</option>
                  <option value="owner_block">Owner Personal Block</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1 font-bold">
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
