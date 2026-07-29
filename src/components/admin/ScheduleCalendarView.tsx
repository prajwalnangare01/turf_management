import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { SlotEngine } from '../../services/slotEngine';
import { RedisLockService } from '../../services/redisLockService';
import { Booking, AdminUser, Court } from '../../types/schema';
import { formatTime12h, formatTimeRange12h } from '../../utils/formatters';
import { OfflineBookingModal } from './OfflineBookingModal';
import { ActiveCustomerHoldModal } from '../common/ActiveCustomerHoldModal';
import { Calendar, ChevronLeft, ChevronRight, Plus, UserCheck, XCircle, CheckCircle, Lock, KeyRound } from 'lucide-react';

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

  // Detail modal for active hold slot
  const [selectedHoldSlot, setSelectedHoldSlot] = useState<{ court: Court; date: string; time: string } | null>(null);

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

        <div className="flex items-center gap-3 text-xs text-on-surface-variant font-medium">
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
                            slot.status === 'booked_online'
                              ? 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-900'
                              : 'bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex justify-between items-center font-bold">
                            <span className="truncate">{store.getCustomers().find(c => c.id === booking.customer_id)?.name || 'Guest'}</span>
                            <span className="text-[9px] px-1 bg-white/80 rounded uppercase font-black">{slot.status === 'booked_online' ? 'ONL' : 'WLK'}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono font-bold bg-white/90 px-1 py-0.5 rounded border border-black/10 text-on-surface">
                              OTP: {booking.booking_ref.slice(-4)}
                            </span>
                            <span className="font-headline font-bold">₹{booking.total_amount}</span>
                          </div>
                        </div>
                      )}

                      {slot.status === 'blocked' && (
                        <div className="w-full h-14 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 text-[10px] font-medium flex items-center justify-center p-2 text-center">
                          🔒 {slot.blocked_reason}
                        </div>
                      )}

                      {slot.status === 'locked' && (
                        <button
                          type="button"
                          onClick={() => setSelectedHoldSlot({ court, date: selectedDate, time: timeStr })}
                          className="w-full h-14 rounded-lg bg-sky-100 hover:bg-sky-200 border border-sky-300 text-sky-900 text-[10px] font-headline font-bold flex flex-col items-center justify-center p-1.5 text-center animate-pulse transition-colors"
                          title="Click to view hold remaining time and unlock slot"
                        >
                          <span className="flex items-center gap-1">⏱️ 2-Min Hold</span>
                          <span className="text-[9px] underline font-bold">Click for Time</span>
                        </button>
                      )}

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
              <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">{selectedBooking.booking_ref}</span>
            </div>

            {/* Prominent Gate Check-in OTP Display */}
            <div className="bg-secondary-container/20 border-2 border-dashed border-secondary-container p-3.5 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-headline font-bold text-xs text-on-secondary-container">
                <KeyRound className="w-4 h-4 text-secondary" />
                <span>Gate Verification OTP:</span>
              </div>
              <span className="font-mono font-black text-2xl tracking-[0.2em] bg-white text-on-secondary-container px-3 py-1 rounded shadow-sm border border-secondary-container/40">
                {selectedBooking.booking_ref.slice(-4)}
              </span>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl space-y-2 text-xs border border-outline-variant/30">
              <p className="text-on-surface-variant">Customer: <strong className="text-on-surface font-semibold">{store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.name}</strong></p>
              <p className="text-on-surface-variant">Phone: <strong className="text-on-surface font-semibold">+91 {store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.phone}</strong></p>
              <p className="text-on-surface-variant">Court: <strong className="text-on-surface font-semibold">{store.getCourts().find(c => c.id === selectedBooking.court_id)?.name}</strong></p>
              <p className="text-on-surface-variant">Date & Time: <strong className="text-primary font-bold">{selectedBooking.booking_date} | {formatTimeRange12h(selectedBooking.start_time, selectedBooking.end_time)}</strong></p>
              <p className="text-on-surface-variant">Source: <strong className="text-secondary font-headline uppercase">{selectedBooking.source}</strong></p>
              <p className="text-on-surface-variant">Status: <strong className="text-primary font-headline uppercase">{selectedBooking.status}</strong></p>
              <p className="text-on-surface-variant">Amount Paid: <strong className="text-on-surface font-headline font-extrabold text-sm">₹{selectedBooking.total_amount}</strong></p>
              {selectedBooking.notes && <p className="text-on-surface-variant italic mt-1">Notes: {selectedBooking.notes}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-headline font-bold text-on-surface-variant">Update Status:</p>
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
              <button
                onClick={() => handleUpdateStatus(selectedBooking.id, 'cancelled')}
                className="w-full py-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg font-bold hover:bg-red-100 flex items-center justify-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel Booking
              </button>
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
    </div>
  );
};
