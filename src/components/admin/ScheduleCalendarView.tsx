import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { Booking, AdminUser, Court, BlockedSlot } from '../../types/schema';
import { formatTime12h, formatTimeRange12h } from '../../utils/formatters';
import { OfflineBookingModal } from './OfflineBookingModal';
import { AdminRefundModal } from './AdminRefundModal';
import { EmergencyWeatherModal } from './EmergencyWeatherModal';
import { ActiveCustomerHoldModal } from '../common/ActiveCustomerHoldModal';
import { Calendar, ChevronLeft, ChevronRight, Plus, UserCheck, XCircle, CheckCircle, Lock, KeyRound, RotateCcw, CloudRain, ShieldAlert, Unlock, Wrench, Clock, AlertTriangle } from 'lucide-react';

interface ScheduleCalendarViewProps {
  currentAdmin: AdminUser;
}



export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({ currentAdmin }) => {
  const courts = store.getCourts();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Selected cell for offline booking modal
  const [offlineModalSlot, setOfflineModalSlot] = useState<{ courtId: string; date: string; time: string } | null>(null);

  // Detail drawer for selected booking
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [refundBooking, setRefundBooking] = useState<Booking | null>(null);

  // Re-render when store updates via Supabase Realtime (e.g. WhatsApp hold/booking)
  const [, setStoreVersion] = useState(0);
  useEffect(() => {
    return store.subscribe(() => {
      setStoreVersion(v => v + 1);
    });
  }, []);

  // 1-second live ticker for real-time hold countdowns in the grid
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Detail modal for active hold slot
  const [selectedHoldSlot, setSelectedHoldSlot] = useState<{ court: Court; date: string; time: string; remainingSec?: number } | null>(null);

  // Emergency Weather Rainout Modal (CC-D02)
  const [showRainoutModal, setShowRainoutModal] = useState(false);

  // Pitch Blocking & Maintenance Modal (CC-D03)
  const [blockModalState, setBlockModalState] = useState<{
    isOpen: boolean;
    courtId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    reason: 'maintenance' | 'private_event' | 'owner_block';
  }>({
    isOpen: false,
    courtId: courts[0]?.id || '',
    startDate: selectedDate,
    startTime: '14:00',
    endDate: selectedDate,
    endTime: '18:00',
    reason: 'maintenance'
  });

  const handleCreateBlockSlot = () => {
    const { courtId, startDate, startTime, endDate, endTime, reason } = blockModalState;

    if (endDate < startDate || (endDate === startDate && endTime <= startTime)) {
      alert('⚠️ Invalid Schedule: End Date & Time must be strictly after Start Date & Time.');
      return;
    }

    // CC-D03: Guard checking if any active confirmed or pending booking exists in this interval
    const conflict = store.getBookings().find(b =>
      b.court_id === courtId &&
      (b.status === 'confirmed' || b.status === 'pending_payment') &&
      PostgresEngine.isDateTimeOverlap(
        b.booking_date,
        b.start_time,
        b.end_time,
        startDate,
        startTime,
        endDate,
        endTime
      )
    );

    if (conflict) {
      alert(`⚠️ [Court Block Conflict Guard (CC-D03)] Cannot block court:\n\nActive booking ${conflict.booking_ref} (${conflict.customer_name}) exists on ${conflict.booking_date} (${conflict.start_time} - ${conflict.end_time}).\n\nPlease reschedule or cancel the booking first before scheduling pitch maintenance.`);
      return;
    }

    const blockedSlots = store.getBlockedSlots();
    const newBlock: BlockedSlot = {
      id: `blk-${Date.now()}`,
      court_id: courtId,
      date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      reason,
      created_by_admin_id: currentAdmin.id
    };

    const updated = [...blockedSlots, newBlock];
    store.setBlockedSlots(updated);
    SupabaseSyncService.syncBlockedSlotToSupabase(newBlock);

    AuditLogger.log(
      currentAdmin.id,
      'CREATE_BLOCKED_SLOT',
      'Court',
      courtId,
      null,
      newBlock
    );

    const scheduleDesc = startDate === endDate
      ? `${startDate} from ${startTime} to ${endTime}`
      : `${startDate} (${startTime}) to ${endDate} (${endTime})`;

    alert(`Court blocked successfully for ${reason.replace('_', ' ')} (${scheduleDesc})`);
    setBlockModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleUnblockSlot = (courtId: string, timeStr: string) => {
    const confirmed = confirm(`Do you want to unblock this slot and restore availability?`);
    if (!confirmed) return;

    const blockedSlots = store.getBlockedSlots();
    // Locate the matching block record that covers this slot
    const targetBlock = blockedSlots.find(b => {
      if (b.court_id !== courtId) return false;
      const bStartDate = b.date;
      const bEndDate = b.end_date || b.date;
      if (selectedDate < bStartDate || selectedDate > bEndDate) return false;
      return true;
    });

    const updated = targetBlock
      ? blockedSlots.filter(b => b.id !== targetBlock.id)
      : blockedSlots.filter(b => !(b.court_id === courtId && b.date === selectedDate));

    store.setBlockedSlots(updated);
    if (targetBlock) {
      SupabaseSyncService.removeBlockedSlotFromSupabase(targetBlock.id);
    }
    AuditLogger.log(currentAdmin.id, 'DELETE_BLOCKED_SLOT', 'Court', courtId, null, { date: selectedDate, time: timeStr });
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Generate time rows dynamically based on all computed slots for active courts for the selected date
  const allSlotStartTimes = Array.from(
    new Set(courts.flatMap(c => SlotEngine.computeSlotsForCourt(c, selectedDate).map(s => s.start_time)))
  ).sort();

  const timeRows = allSlotStartTimes.length > 0
    ? allSlotStartTimes
    : Array.from({ length: 17 }, (_, i) => `${(6 + i).toString().padStart(2, '0')}:00`);

  const handleUpdateStatus = (bookingId: string, status: 'completed' | 'no_show' | 'cancelled') => {
    const res = PostgresEngine.updateBookingStatus(bookingId, status);
    if (res.success) {
      AuditLogger.log(currentAdmin.id, `UPDATE_BOOKING_STATUS_${status.toUpperCase()}`, 'Booking', bookingId);
      setSelectedBooking(null);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-4 text-on-surface">
      {/* Calendar Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/40">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-headline font-bold text-lg text-primary">Pitch Schedule Matrix</h2>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="btn-secondary p-1.5 rounded-lg">
            <ChevronLeft className="w-4 h-4 text-on-surface" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="form-input text-xs font-bold py-1.5 px-3 w-36"
          />

          <button onClick={() => changeDate(1)} className="btn-secondary p-1.5 rounded-lg">
            <ChevronRight className="w-4 h-4 text-on-surface" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* CC-D02: Emergency Weather Rainout Trigger */}
          <button
            onClick={() => setShowRainoutModal(true)}
            className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
            title="Mass cancel and 100% refund all bookings due to rain/waterlogging"
          >
            <CloudRain className="w-3.5 h-3.5 text-red-600 animate-pulse" />
            <span>Rainout / Mass Cancel</span>
          </button>

          {/* CC-D03: Pitch Maintenance / Block Slot */}
          <button
            onClick={() => setBlockModalState(prev => ({
              ...prev,
              isOpen: true,
              courtId: courts[0]?.id || '',
              startDate: selectedDate,
              endDate: selectedDate
            }))}
            className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
            title="Block pitch for maintenance or private events"
          >
            <Lock className="w-3.5 h-3.5 text-gray-600" />
            <span>Block Pitch</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs text-on-surface-variant font-medium">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Online</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Walk-in</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span> 2-Min Hold</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Free</span>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-white border border-outline-variant/40 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/40 text-xs font-headline font-bold text-on-surface-variant">
              <th className="p-3 w-24 text-center border-r border-outline-variant/40">Time</th>
              {courts.map(court => (
                <th key={court.id} className="p-3 border-r border-outline-variant/40 last:border-r-0">
                  <div className="font-headline font-bold text-on-surface text-sm">{court.name}</div>
                  <div className="text-[10px] text-primary font-bold">₹{court.base_price_per_hour}/hr</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map(timeStr => (
              <tr key={timeStr} className="border-b border-outline-variant/30 hover:bg-surface-container-low/50">
                {/* Time Column */}
                <td className="p-3 font-mono text-xs text-center border-r border-outline-variant/40 font-bold bg-surface-container-low/30">
                  {formatTime12h(timeStr)}
                </td>

                {/* Court Columns */}
                {courts.map(court => {
                  const slots = SlotEngine.computeSlotsForCourt(court, selectedDate);
                  const slot = slots.find(s => s.start_time === timeStr);

                  if (!slot) {
                    return (
                      <td key={court.id} className="p-2 border-r border-outline-variant/30 last:border-r-0 bg-gray-50/50">
                        <span className="text-[10px] text-gray-400 block text-center italic">Closed</span>
                      </td>
                    );
                  }

                  const booking = slot.existing_booking;
                  const isBooked = slot.status === 'booked_online' || slot.status === 'booked_offline';

                  return (
                    <td key={court.id} className="p-2 border-r border-outline-variant/30 last:border-r-0">
                      {slot.status === 'available' && (
                        <button
                          onClick={() => setOfflineModalSlot({ courtId: court.id, date: selectedDate, time: timeStr })}
                          className="w-full h-14 rounded-lg bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40 text-primary text-xs font-bold flex flex-col items-center justify-center transition-all group p-1"
                        >
                          <span className="text-[11px] flex items-center gap-1 group-hover:scale-105">
                            <Plus className="w-3.5 h-3.5 text-primary" /> Book
                          </span>
                          <span className="text-[10px] text-on-surface-variant font-medium">₹{slot.price}</span>
                        </button>
                      )}

                      {isBooked && booking && (
                        <div
                          onClick={() => setSelectedBooking(booking)}
                          className={`w-full h-14 rounded-lg p-2 flex flex-col justify-between text-[11px] cursor-pointer transition-all shadow-sm ${
                            booking.source === 'offline_whatsapp'
                              ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950'
                              : booking.source === 'online'
                              ? 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-900'
                              : 'bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex justify-between items-center font-bold">
                            <span className="truncate">{store.getCustomers().find(c => c.id === booking.customer_id)?.name || booking.customer_name || 'Guest'}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-black tracking-tight ${
                              booking.source === 'offline_whatsapp'
                                ? 'bg-emerald-600 text-white'
                                : booking.source === 'online'
                                ? 'bg-red-600 text-white'
                                : 'bg-amber-600 text-white'
                            }`}>
                              {booking.source === 'offline_whatsapp' ? 'WA' : booking.source === 'online' ? 'ONL' : 'WLK'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono font-bold bg-white/90 px-1 py-0.5 rounded border border-black/10 text-on-surface">
                              OTP: {(booking.booking_ref || booking.id || '').slice(-4) || '----'}
                            </span>
                            <span className="font-headline font-bold">₹{booking.total_amount || 0}</span>
                          </div>
                        </div>
                      )}

                      {slot.status === 'blocked' && (
                        <button
                          type="button"
                          onClick={() => handleUnblockSlot(court.id, timeStr)}
                          className="w-full h-14 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-[10px] font-medium flex flex-col items-center justify-center p-1 text-center cursor-pointer transition-colors"
                          title="Click to unblock pitch slot"
                        >
                          <span className="font-bold flex items-center gap-1">🔒 {slot.blocked_reason}</span>
                          <span className="text-[9px] text-gray-500 underline font-semibold">Click to unblock</span>
                        </button>
                      )}

                      {slot.status === 'locked' && (() => {
                        const remainingSec = slot.lock_expires_at
                          ? Math.max(0, Math.ceil((slot.lock_expires_at - currentTimeMs) / 1000))
                          : 0;
                        const m = Math.floor(remainingSec / 60);
                        const s = remainingSec % 60;
                        const timerStr = `${m}:${s < 10 ? '0' + s : s}`;

                        return (
                          <button
                            type="button"
                            onClick={() => setSelectedHoldSlot({ court, date: selectedDate, time: timeStr, remainingSec })}
                            className="w-full h-14 rounded-lg bg-sky-100 hover:bg-sky-200 border border-sky-300 text-sky-950 text-[10px] font-headline font-bold flex flex-col items-center justify-center p-1.5 text-center animate-pulse transition-colors cursor-pointer"
                            title="Click to view hold remaining time and unlock slot"
                          >
                            <span className="flex items-center gap-1 font-mono font-black text-xs text-sky-900">
                              ⏱️ {timerStr}
                            </span>
                            <span className="text-[9px] underline font-bold truncate max-w-full text-sky-800">
                              {slot.locked_by?.startsWith('+91') || (slot.locked_by && slot.locked_by.length === 10) ? 'WhatsApp Hold' : 'Online Hold'}
                            </span>
                          </button>
                        );
                      })()}

                      {slot.status === 'past' && (
                        <div className="w-full h-14 rounded-lg bg-gray-50 text-gray-400 text-[10px] flex items-center justify-center font-medium">
                          Passed
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Booking Detail Drawer Modal */}
      {selectedBooking && (
        <div className="modal-overlay">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
              <h3 className="font-headline font-bold text-lg text-primary">Booking Details</h3>
              <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">{selectedBooking.booking_ref || selectedBooking.id}</span>
            </div>

            {/* Prominent Gate Check-in OTP Display */}
            <div className="bg-secondary-container/20 border-2 border-dashed border-secondary-container p-3.5 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-headline font-bold text-xs text-on-secondary-container">
                <KeyRound className="w-4 h-4 text-secondary" />
                <span>Gate Verification OTP:</span>
              </div>
              <span className="font-mono font-black text-2xl tracking-[0.2em] bg-white text-on-secondary-container px-3 py-1 rounded shadow-sm border border-secondary-container/40">
                {(selectedBooking.booking_ref || selectedBooking.id || '').slice(-4) || '----'}
              </span>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl space-y-2 text-xs border border-outline-variant/30">
              <p className="text-on-surface-variant">Customer: <strong className="text-on-surface font-semibold">{store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.name || selectedBooking.customer_name || 'Customer'}</strong></p>
              <p className="text-on-surface-variant">Phone: <strong className="text-on-surface font-semibold">{selectedBooking.customer_phone || store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.phone || 'N/A'}</strong></p>
              <p className="text-on-surface-variant">Court: <strong className="text-on-surface font-semibold">{store.getCourts().find(c => c.id === selectedBooking.court_id)?.name || selectedBooking.court_id}</strong></p>
              <p className="text-on-surface-variant">Date & Time: <strong className="text-primary font-bold">{selectedBooking.booking_date} | {formatTimeRange12h(selectedBooking.start_time, selectedBooking.end_time)}</strong></p>
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <span>Source:</span>
                <span className={`px-2 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                  selectedBooking.source === 'offline_whatsapp'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : selectedBooking.source === 'online'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  {selectedBooking.source === 'offline_whatsapp' ? '💬 WhatsApp AI Agent' : selectedBooking.source === 'offline_walkin' ? '🚶 Walk-in Counter' : selectedBooking.source === 'offline_phone' ? '📞 Phone Reservation' : '🌐 Website Online'}
                </span>
              </div>
              <p className="text-on-surface-variant">Status: <strong className="text-primary font-headline uppercase">{selectedBooking.status}</strong></p>
              <p className="text-on-surface-variant">Amount Paid: <strong className="text-on-surface font-headline font-extrabold text-sm">₹{selectedBooking.total_amount}</strong></p>
              {selectedBooking.refund_amount !== undefined && (
                <div className="bg-red-50 border border-red-200 p-2 rounded-lg text-red-900 space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>Refunded Amount:</span>
                    <span>₹{selectedBooking.refund_amount}</span>
                  </div>
                  {selectedBooking.cancellation_met_terms !== undefined && (
                    <div className="text-[10px] font-bold">
                      Terms Status: {selectedBooking.cancellation_met_terms ? '✅ Met Terms' : '⚠️ Terms Not Met'}
                    </div>
                  )}
                  {selectedBooking.refund_reason && (
                    <p className="text-[10px] text-red-700 italic">Reason: {selectedBooking.refund_reason}</p>
                  )}
                </div>
              )}
              {selectedBooking.notes && <p className="text-on-surface-variant italic mt-1">Notes: {selectedBooking.notes}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-headline font-bold text-on-surface-variant">Update Status & Actions:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedBooking.id, 'completed')}
                  className="btn-primary text-xs py-2 flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Completed
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedBooking.id, 'no_show')}
                  className="btn-secondary text-xs py-2 text-amber-700 flex items-center justify-center gap-1 font-bold"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-700" /> No-Show
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedBooking.id, 'cancelled')}
                  className="py-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg font-bold hover:bg-red-100 flex items-center justify-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>

                <button
                  onClick={() => {
                    setRefundBooking(selectedBooking);
                    setSelectedBooking(null);
                  }}
                  className="py-2 text-xs bg-purple-50 text-purple-900 border border-purple-300 rounded-lg font-bold hover:bg-purple-100 flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-purple-700" /> Issue Refund
                </button>
              </div>
            </div>

            <button
              onClick={() => setSelectedBooking(null)}
              className="btn-secondary w-full py-2.5 text-xs font-bold mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Active Hold Slot Inspection Modal */}
      {selectedHoldSlot && (
        <ActiveCustomerHoldModal
          court={selectedHoldSlot.court}
          date={selectedHoldSlot.date}
          time={selectedHoldSlot.time}
          initialRemainingSec={selectedHoldSlot.remainingSec}
          onClose={() => setSelectedHoldSlot(null)}
        />
      )}

      {/* Offline Booking Modal trigger */}
      {offlineModalSlot && (
        <OfflineBookingModal
          initialCourtId={offlineModalSlot.courtId}
          initialDate={offlineModalSlot.date}
          initialStartTime={offlineModalSlot.time}
          currentAdmin={currentAdmin}
          onClose={() => setOfflineModalSlot(null)}
          onSuccess={() => setOfflineModalSlot(null)}
        />
      )}

      {/* Admin Refund Modal */}
      <AdminRefundModal
        isOpen={!!refundBooking}
        booking={refundBooking}
        currentAdmin={currentAdmin}
        onClose={() => setRefundBooking(null)}
        onSuccess={() => setRefundBooking(null)}
      />

      {/* CC-D02: Emergency Weather Rainout Modal */}
      <EmergencyWeatherModal
        isOpen={showRainoutModal}
        currentAdmin={currentAdmin}
        initialDate={selectedDate}
        onClose={() => setShowRainoutModal(false)}
        onSuccess={() => setShowRainoutModal(false)}
      />

      {/* CC-D03: Pitch Maintenance / Block Slot Modal */}
      {blockModalState.isOpen && (
        <div className="modal-overlay z-[9999]">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
              <h3 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
                <Lock className="w-5 h-5 text-gray-700" /> Block Court / Pitch
              </h3>
              <button
                onClick={() => setBlockModalState(prev => ({ ...prev, isOpen: false }))}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> Active Booking Conflict Guard (CC-D03)
              </p>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                The system strictly blocks court maintenance reservations if any active confirmed or pending customer reservation exists in that interval.
              </p>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleCreateBlockSlot(); }} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Select Court Arena *</label>
                <select
                  value={blockModalState.courtId}
                  onChange={e => setBlockModalState(prev => ({ ...prev, courtId: e.target.value }))}
                  className="form-input text-xs font-bold"
                >
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Maintenance Start Schedule */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <p className="font-bold text-gray-800 flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> Maintenance Start *
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 font-semibold mb-0.5 block">Start Date *</label>
                    <input
                      type="date"
                      required
                      value={blockModalState.startDate}
                      onChange={e => {
                        const newStart = e.target.value;
                        setBlockModalState(prev => ({
                          ...prev,
                          startDate: newStart,
                          endDate: prev.endDate < newStart ? newStart : prev.endDate
                        }));
                      }}
                      className="form-input text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-semibold mb-0.5 block">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={blockModalState.startTime}
                      onChange={e => setBlockModalState(prev => ({ ...prev, startTime: e.target.value }))}
                      className="form-input text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Maintenance End Schedule */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <p className="font-bold text-gray-800 flex items-center gap-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-amber-700" /> Maintenance End *
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 font-semibold mb-0.5 block">End Date *</label>
                    <input
                      type="date"
                      required
                      min={blockModalState.startDate}
                      value={blockModalState.endDate}
                      onChange={e => setBlockModalState(prev => ({ ...prev, endDate: e.target.value }))}
                      className="form-input text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-semibold mb-0.5 block">End Time *</label>
                    <input
                      type="time"
                      required
                      value={blockModalState.endTime}
                      onChange={e => setBlockModalState(prev => ({ ...prev, endTime: e.target.value }))}
                      className="form-input text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Blocking Reason *</label>
                <select
                  value={blockModalState.reason}
                  onChange={e => setBlockModalState(prev => ({ ...prev, reason: e.target.value as any }))}
                  className="form-input text-xs font-bold"
                >
                  <option value="maintenance">🛠️ Pitch Maintenance & Turf Brushing</option>
                  <option value="private_event">🏆 Private Tournament / League Match</option>
                  <option value="owner_block">🔒 Venue Owner Reservation</option>
                </select>
              </div>

              {/* Live Preview / Validation */}
              {(() => {
                const isInvalid = blockModalState.endDate < blockModalState.startDate ||
                  (blockModalState.endDate === blockModalState.startDate && blockModalState.endTime <= blockModalState.startTime);

                if (isInvalid) {
                  return (
                    <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>End Date & Time must be after Start Date & Time.</span>
                    </div>
                  );
                }

                const conflict = store.getBookings().find(b =>
                  b.court_id === blockModalState.courtId &&
                  (b.status === 'confirmed' || b.status === 'pending_payment') &&
                  PostgresEngine.isDateTimeOverlap(
                    b.booking_date,
                    b.start_time,
                    b.end_time,
                    blockModalState.startDate,
                    blockModalState.startTime,
                    blockModalState.endDate,
                    blockModalState.endTime
                  )
                );

                if (conflict) {
                  return (
                    <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900">
                      <span className="font-bold flex items-center gap-1 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Conflict:
                      </span>
                      <span>Booking {conflict.booking_ref} on {conflict.booking_date} ({conflict.start_time} - {conflict.end_time}) exists in this window.</span>
                    </div>
                  );
                }

                return (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      {blockModalState.startDate === blockModalState.endDate
                        ? `Pitch will be blocked on ${blockModalState.startDate} (${blockModalState.startTime} - ${blockModalState.endTime})`
                        : `Pitch will be blocked from ${blockModalState.startDate} ${blockModalState.startTime} to ${blockModalState.endDate} ${blockModalState.endTime}`}
                    </span>
                  </div>
                );
              })()}

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setBlockModalState(prev => ({ ...prev, isOpen: false }))}
                  className="btn-secondary flex-1 py-2 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    blockModalState.endDate < blockModalState.startDate ||
                    (blockModalState.endDate === blockModalState.startDate && blockModalState.endTime <= blockModalState.startTime)
                  }
                  className="btn-primary flex-1 py-2 text-xs font-bold disabled:opacity-50"
                >
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
